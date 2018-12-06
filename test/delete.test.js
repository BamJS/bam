const deployLambda = require('../src/aws/deployLambda.js');
const deployApi = require('../src/aws/deployApi.js');
const destroy = require('../src/commands/destroy');
const { createBamRole } = require('../src/aws/createRoles');
const { doesLambdaExist, doesApiExist } = require('../src/aws/doesResourceExist');
const setupBamDirAndFiles = require('../src/util/setupBamDirAndFiles');
const { asyncGetRegion } = require('../src/util/getRegion');

const {
  asyncDeleteRole,
  asyncDetachPolicy,
} = require('../src/aws/awsFunctions');

const {
  promisifiedRimraf,
  unlink,
  readFile,
  writeFile,
  readConfig,
  writeConfig,
  writeLambda,
  writeApi,
  readApisLibrary,
  readLambdasLibrary,
  getStagingPath,
  exists,
  getBamPath,
} = require('../src/util/fileUtils');

const roleName = 'testBamRole';
const lambdaName = 'testBamLambda';
const lambdaDescription = 'test description';
const testPolicyARN = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';
const path = './test';
const bamPath = getBamPath(path);
const stagingPath = getStagingPath(path);
const cwd = process.cwd();
const stageName = 'bam';
const httpMethods = ['GET'];

describe('bam delete lambda', () => {
  beforeEach(async () => {
    jest.setTimeout(100000);
    await setupBamDirAndFiles(roleName, path);
    const config = await readConfig(path);
    config.accountNumber = process.env.AWS_ID;
    await writeConfig(path, config);
    await createBamRole(roleName);
    const testLambdaFile = await readFile('./test/templates/testLambda.js');
    await writeFile(`${cwd}/${lambdaName}.js`, testLambdaFile);
    const lambdaData = await deployLambda(lambdaName, lambdaDescription, path);
    const { restApiId, endpoint } = await deployApi(lambdaName, path, httpMethods, stageName);
    await writeLambda(lambdaData, path, lambdaDescription);
    await writeApi(endpoint, httpMethods, lambdaName, restApiId, path);
  });

  afterEach(async () => {
    await promisifiedRimraf(bamPath);
    await unlink(`${cwd}/${lambdaName}.js`);
    await asyncDetachPolicy({ PolicyArn: testPolicyARN, RoleName: roleName });
    await asyncDeleteRole({ RoleName: roleName });
  });

  test('Lambda directory does not exists within stagingPath', async () => {
    let template = await exists(`${stagingPath}/${lambdaName}`);
    expect(template).toBe(true);
    await destroy(lambdaName, path);
    template = await exists(`${stagingPath}/${lambdaName}`);
    expect(template).toBe(false);
  });

  test('Lambda metadata is removed from ./test/.bam/lambdas.json and ./test/.bam/apis.json', async () => {
    const region = await asyncGetRegion();
    let lambdas = await readLambdasLibrary(path);
    let lambda = lambdas[region][lambdaName];
    let apis = await readApisLibrary(path);
    let api = apis[region][lambdaName];
    expect(lambda).toBeDefined();
    expect(api).toBeDefined();

    await destroy(lambdaName, path);

    lambdas = await readLambdasLibrary(path);
    lambda = lambdas[region][lambdaName];
    apis = await readApisLibrary(path);
    api = apis[region][lambdaName];
    expect(lambda).toBeUndefined();
    expect(api).toBeUndefined();
  });

  test('Lambda does not exists on AWS', async () => {
    let lambda = await doesLambdaExist(lambdaName);
    expect(lambda).toBe(true);
    await destroy(lambdaName, path);
    lambda = await doesLambdaExist(lambdaName);
    expect(lambda).toBe(false);
  });

  test('API endpoint does not exists on AWS', async () => {
    const region = await asyncGetRegion();
    const apis = await readApisLibrary(path);
    const { restApiId } = apis[region][lambdaName];
    let endpoint = await doesApiExist(restApiId);
    expect(endpoint).toBe(true);
    await destroy(lambdaName, path);
    endpoint = await doesApiExist(restApiId);
    expect(endpoint).toBe(false);
  });
});
