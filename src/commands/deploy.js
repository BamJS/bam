const deployLambda = require('../aws/deployLambda');
const deployApi = require('../aws/deployApi');
const getUserInput = require('../util/getUserInput');
const { bamWarn } = require('../util/logger');
const { validateLambdaDeployment, validateApiMethods } = require('../util/validations');

const stage = 'bam';

const checkForLambdaOnlyOption = (options) => {
  const optionsKeys = Object.keys(options);
  return optionsKeys.some(opt => (/lambda/).test(opt));
};

module.exports = async function deploy(lambdaName, path, options) {
  const deployLambdaOnly = checkForLambdaOnlyOption(options);

  const invalidLambdaMsg = await validateLambdaDeployment(lambdaName);
  if (invalidLambdaMsg) {
    bamWarn(invalidLambdaMsg);
    return;
  }

  const httpMethods = options.methods ? options.methods.map(method => method.toUpperCase()) : ['GET'];
  const invalidApiMsg = validateApiMethods(httpMethods);
  if (invalidApiMsg) {
    bamWarn(invalidApiMsg);
    return;
  }

  const question = {
    question: 'Please give a brief description of your lambda: ',
    validator: () => (true),
    feedback: 'invalid description',
    defaultAnswer: '',
  };

  try {
    const input = await getUserInput([question]);
    if (input === undefined) {
      bamWarn('Lambda deployment aborted');
      return;
    }

    const [description] = input;
    await deployLambda(lambdaName, description, path, options.permitDb);
    if (deployLambdaOnly) return;
    await deployApi(lambdaName, path, httpMethods, stage);
  } catch (err) {
    bamWarn(err);
  }
};
