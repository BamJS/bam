const deployLambda = require('../aws/deployLambda');
const deployApi = require('../aws/deployApi');
const checkForOptionType = require('../util/checkForOptionType');
const getOption = require('../util/getOption');
const bamBam = require('../util/bamBam');

const {
  bamWarn,
  bamError,
  msgAfterAction,
} = require('../util/logger');

const {
  validateLambdaDeployment,
  validateLambdaDirDeployment,
  validateApiMethods,
  validateRoleAssumption,
} = require('../util/validations');

const {
  writeLambda,
  writeApi,
  deleteStagingDirForLambda,
} = require('../util/fileUtils');

const deploymentType = require('../util/deploymentType');

const stage = 'bam';
const dbRole = 'databaseBamRole';

module.exports = async function deploy(resourceName, path, options) {
  const deployLambdaOnly = checkForOptionType(options, 'lambda');
  const permitDb = checkForOptionType(options, 'db');
  const roleOption = getOption(options, 'role');

  const userRole = options[roleOption] && options[roleOption][0];
  let roleName;
  if (permitDb) roleName = dbRole;
  if (userRole) {
    const invalidRoleMsg = await validateRoleAssumption(userRole);
    if (invalidRoleMsg) {
      bamWarn(invalidRoleMsg);
      return;
    }
    roleName = userRole;
  }

  const invalidLambdaMsg = await validateLambdaDeployment(resourceName);
  const invalidDirMsg = await validateLambdaDirDeployment(resourceName);
  const { deployDir, invalidMsg, aborted } = await deploymentType(
    resourceName, invalidLambdaMsg, invalidDirMsg,
  );
  if (aborted) {
    bamWarn(msgAfterAction('lambda', resourceName, 'aborted', 'creation has been'));
    return;
  }
  if (invalidMsg) {
    bamWarn(invalidMsg);
    return;
  }

  const methodOption = getOption(options, 'method');
  const methods = options[methodOption];
  const httpMethods = methods ? methods.map(m => m.toUpperCase()) : ['GET'];

  const validateMethodsParams = {
    addMethods: httpMethods,
    resourceName,
    path,
  };

  const invalidApiMsg = await validateApiMethods(validateMethodsParams);
  if (invalidApiMsg) {
    bamWarn(invalidApiMsg);
    return;
  }

  try {
    const asyncFuncParams = [resourceName, path, roleName, deployDir];
    const lambdaData = await bamBam(deployLambda, { asyncFuncParams });

    if (lambdaData) await writeLambda(lambdaData, path);
    if (deployLambdaOnly) {
      await deleteStagingDirForLambda(resourceName, path);
      return;
    }

    const {
      restApiId,
      endpoint,
      methodPermissionIds,
    } = await deployApi(resourceName, path, httpMethods, stage);

    const writeParams = [
      endpoint,
      methodPermissionIds,
      resourceName,
      restApiId,
      path,
    ];

    if (restApiId) await writeApi(...writeParams);
    await deleteStagingDirForLambda(resourceName, path);
  } catch (err) {
    bamError(err);
  }
};
