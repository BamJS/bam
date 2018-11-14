const fs = require('fs');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const zipper = require('../util/zipper.js');
const bamBam = require('../util/bamBam.js');

const apiVersion = 'latest';

module.exports = async (lambdaName, description, src) => {
  const config = JSON.parse(fs.readFileSync(`${src}/bam/config.json`));
  const { accountNumber, region, role } = config;
  const lambda = new AWS.Lambda({ apiVersion, region });
  const asyncLambdaCreateFunction = promisify(lambda.createFunction.bind(lambda));
  const zippedFileName = await zipper(lambdaName, src);
  const zipContents = fs.readFileSync(zippedFileName);

  const deployLambda = async () => {
    const params = {
      Code: {
        ZipFile: zipContents,
      },
      FunctionName: lambdaName,
      Handler: 'index.handler',
      Role: `arn:aws:iam::${accountNumber}:role/${role}`,
      Runtime: 'nodejs8.10',
      Description: description,
    };

    const actionStr = `deploy ${lambdaName}`;
    const successStr = `deployed ${lambdaName}`;
    return bamBam(asyncLambdaCreateFunction, params, actionStr, successStr);
  };

  const writeToLib = (data) => {
    if (!data) return null;
    const name = data.FunctionName;
    const arn = data.FunctionArn;

    // read contents from library
    const functions = JSON.parse(fs.readFileSync(`${src}/bam/functions/library.json`));
    functions[name] = { arn, description };

    // write back to library
    fs.writeFileSync(`${src}/bam/functions/library.json`, JSON.stringify(functions));
    console.log(`${lambdaName} has been deployed. Check out ${src}/bam/functions/library.json`);
  };

  const data = await deployLambda();
  await writeToLib(data);
};