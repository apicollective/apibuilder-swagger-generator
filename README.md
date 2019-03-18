# apibuilder-swagger-generator

A Lambda function that translates from the Apibuilder service.json to a JSON document that adheres to Swagger Spec 2.0

## Testing

There are some unit tests that rely on service.json from from existing APIs hosted in Apibuilder. These can be refreshed
by running

  ```
  > bin/refresh-specs.sh
  ```

These should be refreshed whenever the service.json format changes, or the APIs themselves change in a way that we
would like to capture in testing here. The changes should be checked in, to document how the tests have changed over
time. In order to run the script, you need to have [jq](https://stedolan.github.io/jq/download/) installed locally.

For the .json files that contain the Swagger output, it is a manual process to:

  1. Capture the output
  2. Properly [lint](https://jsonlint.com) the output
  3. Import it into Swagger
  4. Verify that the resultant Swagger definition properly reflects the original service.json

Due to #4, this process isn't automated.

## Deployment
This is deployed using [cloud-formation/pipeline.yml], tied to master. Any merges to master should trigger a new deployment through this pipeline.
