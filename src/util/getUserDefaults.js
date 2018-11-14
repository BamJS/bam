const fs = require('fs');
const getUserInput = require('./getUserInput.js');

module.exports = async () => {
  const config = JSON.parse(fs.readFileSync('./bam/config.json', 'utf8'));
  const defaultRole = config.role;

  const getUserDefaults = async () => {
    const configPrompts = [
      ['Please provide your AWS account number: ', process.env.AWS_ID],
      ['Please provide your default region: ', config.region],
      ['Please provide your default role (if you do not provide one, one will be created for you): ', defaultRole],
    ];

    const userDefaults = await getUserInput(configPrompts);
    [config.accountNumber, config.region, config.role] = userDefaults;
  };

  const writeConfig = () => {
    const configStr = JSON.stringify(config);
    fs.writeFileSync('./bam/config.json', configStr);
  };

  await getUserDefaults();
  writeConfig();
  console.log('success: config file complete');
};
