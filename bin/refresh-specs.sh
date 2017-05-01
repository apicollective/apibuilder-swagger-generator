#!/bin/bash
testApis=( "bryzek swagger-petstore" "bryzek apidoc-example-union-types")

for orgAndService in "${testApis[@]}"
do
  apidoc download $orgAndService latest service | jq '.' > test/resources/service/${orgAndService/ /-}.json
done