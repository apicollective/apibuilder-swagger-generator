#!/bin/bash
testApis=( "bryzek swagger-petstore" "bryzek apidoc-example-union-types" "hbcmobile wishlist-api")

for orgAndService in "${testApis[@]}"
do
  apibuilder download $orgAndService latest service | jq '.' > test/resources/service/${orgAndService/ /-}.json
done