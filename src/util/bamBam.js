const delay = require('./delay');
const { bamLog, resetCursorPosition } = require('./logger');

const firstTooManyRequestsException = (errorCode, retryCounter) => (
  errorCode === 'TooManyRequestsException' && retryCounter === 0
);

const logAwsDelayMsg = () => {
  resetCursorPosition();
  bamLog('AWS is causing a delay. This will not take more than a minute.');
};

module.exports = async function bamBam(asyncFunc, {
  asyncFuncParams = [],
  retryError = 'InvalidParameterValueException',
  interval = 3000,
  retryCounter = 0,
} = {}) {
  const withIncrementedCounter = () => (
    {
      asyncFuncParams,
      retryError,
      interval,
      retryCounter: retryCounter + 1,
    }
  );

  const retry = async (errCode) => {
    if (firstTooManyRequestsException(errCode, retryCounter)) logAwsDelayMsg();
    const optionalParamsObj = withIncrementedCounter();
    await delay(interval);
    const data = await bamBam(asyncFunc, optionalParamsObj);
    return data;
  };

  try {
    const data = await asyncFunc(...asyncFuncParams);
    return data;
  } catch (err) {
    const errorCode = err.code;
    if (errorCode === retryError) {
      const data = await retry(errorCode);
      return data;
    }

    throw (err);
  }
};
