const { promisify } = require('util');
const fs = require('fs');
const https = require('https');
const AWS = require('aws-sdk');

const createDirectory = require('../src/util/createDirectory');
const configTemplate = require('../src/util/configTemplate');
const createRole = require('../src/util/createRole');
const createJSONFile = require('../src/util/createJSONFile');

const createLambda = require('../src/commands/createLambda.js');
const deployLambda = require('../src/commands/deployLambda.js');
const deployApi = require('../src/commands/deployApi.js');

const deleteLambda = require('../src/commands/deleteLambda');
const { doesApiExist } = require('../src/util/doesResourceExist');
const deleteApi = require('../src/commands/deleteApi');
const delay = require('../src/util/delay.js');

const iam = new AWS.IAM();
const roleName = 'testDefaultBamRole';
const lambdaName = 'testBamLambda';
const stageName = 'test';
const testPolicyARN = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole';
const config = configTemplate(roleName);
config.accountNumber = process.env.AWS_ID;

const asyncDetachPolicy = promisify(iam.detachRolePolicy.bind(iam));
const asyncDeleteRole = promisify(iam.deleteRole.bind(iam));

describe('bam deploy api', () => {
  beforeEach(async () => {
    jest.setTimeout(60000);
    createDirectory('bam', './test');
    createDirectory('functions', './test/bam/');
    createJSONFile('config', './test/bam', config);
    createJSONFile('library', './test/bam/functions', {});
    await createRole(roleName, './test');
    createLambda(lambdaName, './test');
    await deployLambda(lambdaName, 'test description', './test');
    await deployApi(lambdaName, './test', stageName);
  });

  afterEach(async () => {
    const library = JSON.parse(fs.readFileSync('./test/bam/functions/library.json'));
    const { restApiId } = library[lambdaName].api;
    await deleteApi(restApiId, './test');
    await deleteLambda(lambdaName, './test');
    fs.unlinkSync('./test/bam/functions/library.json');
    fs.rmdirSync('./test/bam/functions');
    fs.unlinkSync('./test/bam/config.json');
    fs.rmdirSync('./test/bam');
    await asyncDetachPolicy({ PolicyArn: testPolicyARN, RoleName: roleName });
    await asyncDeleteRole({ RoleName: roleName });
    await delay(30000);
  });

  test('Response is 200 when hitting endpoint from library.json', async () => {
    const library = JSON.parse(fs.readFileSync('./test/bam/functions/library.json'));
    const url = library[lambdaName].api.endpoint;
    let responseStatus;

    const asyncHttpsGet = endpoint => (
      new Promise((resolve) => {
        https.get(endpoint, resolve);
      })
    );

    try {
      const response = await asyncHttpsGet(url);
      responseStatus = response.statusCode;
    } catch (err) {
      console.log(err, err.stack);
    }

    expect(responseStatus).toEqual(200);
  });

  test('Api metadata exists within ./test/bam/functions/library.json', () => {
    const library = JSON.parse(fs.readFileSync('./test/bam/functions/library.json'));
    const { api } = library[lambdaName];
    expect(api).toBeTruthy();
  });

  test('Api endpoint exists on AWS', async () => {
    const library = JSON.parse(fs.readFileSync('./test/bam/functions/library.json'));
    const { restApiId } = library[lambdaName].api;
    const apiExists = await doesApiExist(restApiId);
    expect(apiExists).toBe(true);
  });
});
