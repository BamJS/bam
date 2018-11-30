const { createDirectory, createJSONFile } = require('./fileUtils');
const configTemplate = require('../../templates/configTemplate');

module.exports = async function setupBamDirAndFiles(roleName, path) {
  const configJSON = await configTemplate(roleName);
  await createDirectory('.bam', path);
  await createDirectory('functions', `${path}/.bam`);
  await createJSONFile('config', `${path}/.bam`, configJSON);
  await createJSONFile('library', `${path}/.bam/functions`, {});
  await createJSONFile('dbTables', `${path}/.bam`, {});
};
