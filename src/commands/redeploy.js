const updateLambda = require('../aws/updateLambda');
const deployApi = require('../aws/deployApi');
const { doesApiExist } = require('../aws/doesResourceExist');
const updateHttpMethods = require('../aws/updateHttpMethods');
const bamBam = require('../util/bamBam');
const { asyncGetRegion } = require('../util/getRegion');
const getOption = require('../util/getOption');
const checkForOptionType = require('../util/checkForOptionType');

const {
  asyncCreateDeployment,
  asyncGetResources,
  asyncGetFunction,
} = require('../aws/awsFunctions');

const {
  validateApiMethods,
  validateLambdaReDeployment,
  validateLambdaDirReDeployment,
  validateRoleAssumption,
} = require('../util/validations');

const {
  readLambdasLibrary,
  writeLambda,
  writeApi,
  writeApisLibrary,
  readApisLibrary,
  distinctElements,
  deleteStagingDirForLambda,
} = require('../util/fileUtils');

const {
  msgAfterAction,
  bamLog,
  bamWarn,
} = require('../util/logger');

const deploymentType = require('../util/deploymentType');

const stageName = 'bam';
const dbRole = 'databaseBamRole';

module.exports = async function redeploy(resourceName, path, options) {
  let methodPermissionIds = {};
  const region = await asyncGetRegion();
  const api = {
    restApiId: undefined,
    resources: [],
    addMethods: [],
    removeMethods: [],
    existingMethods: [],
  };

  const getApiId = async () => {
    const apis = await readApisLibrary(path);
    return apis[region] && apis[region][resourceName] && apis[region][resourceName].restApiId;
  };

  api.restApiId = await getApiId();
  const apiExistsOnAws = await doesApiExist(api.restApiId);

  const getApiResources = async () => {
    const { restApiId } = api;
    if (restApiId && apiExistsOnAws) {
      api.resources = (await asyncGetResources({ restApiId })).items;
    }
  };

  const userIsAddingEndpoint = checkForOptionType(options, 'endpoint');
  const methodOption = getOption(options, 'method');
  const userIsAddingMethods = options[methodOption];

  const roleOption = getOption(options, 'role');
  const permitDb = checkForOptionType(options, 'permitDb');
  const revokeDb = checkForOptionType(options, 'revokeDb');
  const userRole = options[roleOption] && options[roleOption][0];
  let roleName;

  if (revokeDb) roleName = '';
  if (permitDb) roleName = dbRole;
  if (userRole) {
    const invalidRoleMsg = await validateRoleAssumption(userRole);
    if (invalidRoleMsg) {
      bamWarn(invalidRoleMsg);
      return;
    }
    roleName = userRole;
  }

  const resolveHttpMethodsFromOptions = () => {
    let addMethods = options[methodOption];

    const removeOption = getOption(options, 'rmmethod');
    let removeMethods = options[removeOption];

    let existingMethods = [];

    addMethods = addMethods
      ? distinctElements(addMethods.map(m => m.toUpperCase())) : [];

    removeMethods = removeMethods
      ? distinctElements(removeMethods.map(m => m.toUpperCase())) : [];

    if (api.resources.length > 0) {
      const resource = api.resources.find(res => res.path === '/');
      existingMethods = Object.keys(resource.resourceMethods || {});
    }

    if (existingMethods.length === 0 && addMethods.length === 0) {
      addMethods.push('GET');
    }

    addMethods = addMethods.filter(m => !existingMethods.includes(m));
    api.addMethods = addMethods;
    api.removeMethods = removeMethods;
    api.existingMethods = existingMethods;
  };

  const deployIntegrations = async () => {
    const rootResource = api.resources.find(res => res.path === '/');
    const greedyResource = api.resources.find(res => res.path === '/{proxy+}');
    const updateParams = {
      rootResource,
      greedyResource,
      resourceName,
      path,
      restApiId: api.restApiId,
      addMethods: api.addMethods,
      removeMethods: api.removeMethods,
    };

    methodPermissionIds = await updateHttpMethods(updateParams);

    await bamBam(asyncCreateDeployment, {
      asyncFuncParams: [{ restApiId: api.restApiId, stageName }],
      retryError: 'TooManyRequestsException',
    });
  };

  const updateApiGateway = async () => {
    const apiExistsInLocalLibrary = !!(api.restApiId);
    const userIsRemovingMethods = api.removeMethods.length > 0;
    let data;

    if ((apiExistsInLocalLibrary || userIsAddingMethods || userIsAddingEndpoint) && !apiExistsOnAws) {
      data = await deployApi(resourceName, path, api.addMethods, stageName);
    } else if (userIsAddingMethods || userIsRemovingMethods) {
      await deployIntegrations(api.resources, api.existingMethods);
    }

    return data;
  };

  const updateLocalLibraries = async (updatedApiData) => {
    if (updatedApiData) {
      const { restApiId, endpoint, methodPermissionIds } = updatedApiData;
      await writeApi(endpoint, methodPermissionIds, resourceName, restApiId, path);
    } else if (apiExistsOnAws) {
      const apis = await readApisLibrary(path);
      const regionalApis = apis[region];
      const regionalApi = regionalApis[resourceName];
      const existingApis = regionalApi.methodPermissionIds;
      regionalApi.methodPermissionIds = Object.assign({}, existingApis, methodPermissionIds);
      api.removeMethods.forEach(method => delete regionalApi.methodPermissionIds[method]);
      await writeApisLibrary(path, apis);
    }
  };

  // redployment sequence starts here:
  const invalidLambdaMsg = await validateLambdaReDeployment(resourceName);
  const invalidDirMsg = await validateLambdaDirReDeployment(resourceName);
  const { deployDir, invalidMsg, aborted } = await deploymentType(resourceName, invalidLambdaMsg, invalidDirMsg);
  if (aborted) {
    bamWarn(msgAfterAction('lambda', resourceName, 'aborted', 'update has been'));
    return;
  }
  if (invalidMsg) {
    bamWarn(invalidMsg);
    return;
  }

  if (apiExistsOnAws || userIsAddingEndpoint || userIsAddingMethods) {
    await getApiResources();
    resolveHttpMethodsFromOptions();

    const validateMethodsParams = {
      addMethods: api.addMethods,
      removeMethods: api.removeMethods,
      existingMethods: api.existingMethods,
      resourceName,
      path,
    };

    const invalidHttp = await validateApiMethods(validateMethodsParams);
    if (invalidHttp) {
      bamWarn(invalidHttp);
      return;
    }
  }

  const localLambda = (await readLambdasLibrary(path))[region][resourceName];
  if (!localLambda) {
    const lambdaData = (await asyncGetFunction({ FunctionName: resourceName })).Configuration;
    writeLambda(lambdaData, path);
  }

  const lambdaUpdateSuccess = await updateLambda(resourceName, path, roleName, deployDir);

  if (lambdaUpdateSuccess) {
    const apiData = await updateApiGateway();
    await updateLocalLibraries(apiData);
    await deleteStagingDirForLambda(resourceName, path);
    bamLog(msgAfterAction('lambda', resourceName, 'updated'));
  } else {
    bamWarn(msgAfterAction('lambda', resourceName, 'updated', 'could not be'));
  }
};
