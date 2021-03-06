// Welcome to your BAM! lambda!

// TODO: describe your lambda below:
// description:


const fs = require('fs');
const { promisify } = require('util');
// all require statements for npm packages should be above this line

// handler is the name of the function being exported; it's best to leave as the default
exports.handler = async (event) => {
  const { pathParameters, queryStringParameters, httpMethod } = event;

  // pathParameters will contain a property called "proxy" if path params were used
  const pathParams = pathParameters ? pathParameters.proxy : '';

  // example use of queryStringParameters to obtain value for "name" parameter
  // const name = queryStringParameters ? queryStringParameters.name : 'no name';

  const response = {};

  // it's only necessary to handle the methods you have created
  // for this API Gateway endpoint (default is GET),
  // but this is an example of how to handle
  // the response for multiple methods
  if (httpMethod === 'GET') {
    // return value must be proper http response
    response.statusCode = 200;
    // content-type headers should be set to text/html
    response.headers = { 'content-type': 'text/html' };
    // root directory of lambda function on AWS
    const rootDir = process.env.LAMBDA_TASK_ROOT;
    const readFile = promisify(fs.readFile);

    // index.html from the rootDir directory
    // note: index.html must be in rootDir directory to be accessible here
    let html = await readFile(`${rootDir}/index.html`, 'utf8');
    // main.css from the rootDir directory
    // note: main.css must be in rootDir directory to be accessible here
    const css = await readFile(`${rootDir}/main.css`, 'utf8');
    // application.js from the rootDir directory
    // note: application.js must be in rootDir directory to be accessible here
    const js = await readFile(`${rootDir}/application.js`, 'utf8');

    const replacePlaceHolder = (nameOfPlaceHolder, newText, replaceAll = false) => {
      if (replaceAll) {
        const regex = new RegExp(nameOfPlaceHolder, 'g');
        html = html.replace(regex, newText);
      } else {
        html = html.replace(nameOfPlaceHolder, newText);
      }
    };

    // there should be an empty style tag in your
    // html file that you fill with the contents of your css file
    replacePlaceHolder('<style></style>', `<style>${css}</style>`);
    // there should be an empty script tag in your
    // html file that you fill with the contents of your js file
    replacePlaceHolder('<script></script>', `<script>${js}</script>`);
    replacePlaceHolder('Placeholder', 'data from your database');

    // what the page will show
    response.body = html;
  } else if (httpMethod === 'POST') {
    response.statusCode = 201;
  } else if (httpMethod === 'DELETE') {
    response.statusCode = 204;
  } else if (httpMethod === 'PUT') {
    response.statusCode = 204;
  } else if (httpMethod === 'PATCH') {
    response.statusCode = 204;
  }

  return response;
};
