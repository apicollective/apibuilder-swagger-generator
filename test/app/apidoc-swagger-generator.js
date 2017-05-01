const assert = require('assert'),
      context = require('aws-lambda-mock-context'),
      fs = require('fs'),
      generator = require('../../app/apidoc-swagger-generator');

describe('apidoc-swagger-generator', function() {
  describe('example files', function() {
    const serviceSourceDir = 'test/resources/service';
    const swaggerSourceDir = 'test/resources/swagger';
    fs.readdirSync(serviceSourceDir).forEach(function(path) {
      it('should correctly parse ' + path, function() {
        serviceDoc = JSON.parse(fs.readFileSync(serviceSourceDir + '/' + path).toString());
        translateServiceJson(serviceDoc, function(swaggerDoc) {
          swaggerExpectedDoc = JSON.parse(fs.readFileSync(swaggerSourceDir + '/' + path).toString());
          assert.deepEqual(swaggerDoc, expectedSwaggerDoc);
        });
      });
    });
  })
});

function translateServiceJson(serviceJson, callback) {
  var ctx = newContext();
  generator.handler({body: JSON.stringify({"service": serviceJson})}, ctx);
  return ctx.Promise
  .then(function(results) {
    assert.equal(results.statusCode, 200);
    callback(JSON.parse(JSON.parse(results.body).source));
  });
}

function newContext() {
  return context({
    region: "us-east-1",
    account: "1234567890",
    functionName: "test"
  });
}