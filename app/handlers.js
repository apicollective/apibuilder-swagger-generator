const Url = require('url');

exports.generatorsHandler = function(event, context, callback) {
  try {
    const key = event.pathParameters ? event.pathParameters.key : null
    const isSingle = (key !== null && key !== undefined)
    if (key !== 'swagger' && isSingle) {
      callback(null, { statusCode: 404 })
    } else {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify([{
          "attributes": [],
          "key": "swagger",
          "name": "Swagger",
          "description": "Swagger 2.0 Export of the API spec",
        }]) 
      })
    }
  } catch (e) {
    console.error(e)
    callback(e)
  }
}

exports.healthCheckHandler = function(event, context, callback) {
  callback(null, { statusCode: 200, body: JSON.stringify({ status: 'healthy' }) })
}

exports.invocationsHandler = (event, context, callback) => {
  const body = JSON.parse(event.body),
    service = body.service;
  var swagger = toSwagger(service);
  removeNulls(swagger);
  doResponse(swagger, context);
};

function toBodyParameter(body, service) {
  if (body) {
  return addSwaggerPassThrough({
    "name": body.type,
    "in": "body",
    "description": body.description,
    "schema": toDefinitionSchema(body.type, service)
  }, body);
  }
}

function toContact(contact) {
  if (contact) {
  return addSwaggerPassThrough({
    "name": contact.name,
    "url": contact.url,
    "email": contact.email
  }, contact);
  }
}

function toDefinitions(models, service) {
  var definitions = {};
  for (var i = 0; i < models.length; i++) {
    var model = models[i];
    definitions[model.name] = toSchema(model, service);
  }
  return Object.keys(definitions).length === 0 ? undefined : addSwaggerPassThrough(definitions, models);
}

function toDefinitionsFromUnions(unions, service) {
  var definitions = {};
  for (var i = 0; i < unions.length; i++) {
    var union = unions[i];
    definitions[union.name] = {
      "type": "object",
      "descriminator": union.descriminator,
      "description": union.description,
      "title": union.name,
      "allOf": union.types.map(function(unionType) {
        var dataType = toTypeAndFormat(unionType.type);
        if (dataType) {
          return dataType;
        } else {
          return toDefinitionOrEnum(unionType.type, service);
        }
      })
    }
  }
  return Object.keys(definitions).length === 0 ? undefined : addSwaggerPassThrough(definitions, unions);
}

function toDefinitionOrEnum(type, service) {
  var foundEnum = service.enums.find(function(enm) { return enm.name == type});
  if (foundEnum) {
    return {
      "type": "string",
      "enum": foundEnum.values.map(function(enm) { return enm.name; })
    };
  } else if (type == "unit") {
    return null;
  } else {
    return { "$ref": "#/definitions/" + type };
  }
}

function toDefinitionSchema(type, service) {
  var arrayType = unwindArray(type);
  if (arrayType.isArray) {
    return {
      "type": "array",
      "items": toDefinitionOrEnum(arrayType.type, service)
    }
  } else {
    return toDefinitionOrEnum(arrayType.type, service);
  }
}

function toHeaders(headers, service) {
  if (headers) {
    var result = {};
    headers.forEach(function(header) {
      result[header.name] = addSwaggerPassThrough(toProperty(header, service), header);
    });
    return result;
  }
}

function toLicense(license) {
  if (license) {
    return addSwaggerPassThrough({
      "name": license.name,
      "url": license.url
    }, license);
  }
}

function toProperty(field, service) {
  var dataType = toTypeAndFormat(field.type);
  if (dataType) {
    return concat({
      "description": field.description,
      "default": field.default,
      "maximum": field.maximum,
      "minimum": field.minimum,
      "example": field.example
    }, dataType);
  } else {
    return toDefinitionSchema(field.type, service);
  }
}

function toSchema(model, service) {
  var required = model.fields.filter(function(field) { return field.required || field.required === undefined; }).map(function(field) { return field.name; });
  if (required.length == 0) required = null;
  var schema = {
    "type": "object",
    "description": model.description,
    "title": model.name,
    "required": required,
    "properties": {}
  };
  for (var i = 0; i < model.fields.length; i++) {
    var field = model.fields[i];
    schema.properties[field.name] = addSwaggerPassThrough(toProperty(field, service), field);
  }
  return addSwaggerPassThrough(schema, model);
}

function toTypeAndFormat(type) {
  var result = null;
  var arrayType = unwindArray(type);
  switch (arrayType.type) {
    case "boolean":
      result = { "type": "boolean" };
      break;
    case "date-iso8601":
      result = { "type": "string", "format": "date" };
      break;
    case "date-time-iso8601":
      result = { "type": "string", "format": "date-time" };
      break;
    case "decimal":
      result = { "type": "number", "format": "float" };
      break;
    case "double":
      result = { "type": "number", "format": "double" };
      break;
    case "integer":
      result = { "type": "integer", "format": "int32" };
      break;
    case "long":
      result = { "type": "integer", "format": "int64" };
      break;
    case "object":
      result = { };
      break;
    case "string":
      result = { "type": "string" };
      break;
    case "unit":
      result = { };
      break;
    case "uuid":
      result = { "type": "string", "format": "uuid" };
      break;
  }
  if (arrayType.isArray && result) {
    return {
      "type": "array",
      "items": result
    };
  } else {
    return result;
  }
}

function toParameters(parameters) {
  return parameters.map(function(parameter) {
    var dataType = toTypeAndFormat(parameter.type);
    return addSwaggerPassThrough(concat({
      "name": parameter.name,
      "in": parameter.location.toLowerCase(),
      "description": parameter.description,
      "required": parameter.required,
      "default": parameter.default,
      "maximum": parameter.maximum,
      "minimum": parameter.minimum
    }, dataType), parameter)
  });
}

function toPaths(resources, service) {
  var paths = {};
  for (var i = 0; i < resources.length; i++) {
    var resource = resources[i];
    var resourcePaths = {};
    for (var j = 0; j < resource.operations.length; j++) {
      var operation = resource.operations[j];
      var parameters = toParameters(operation.parameters);
      var bodyParameter = toBodyParameter(operation.body, service);
      var path = operation.path.replace(/(:([^/]+))/g, '{$2}');
      if (bodyParameter) parameters.push(bodyParameter);
      if (resourcePaths[path] === undefined) resourcePaths[path] = {};
      resourcePaths[path][operation.method.toLowerCase()] = addSwaggerPassThrough({
        "description": operation.description,
        "parameters": parameters,
        "responses": toResponses(operation.responses, service),
      }, operation);
    }
    Object.keys(resourcePaths).forEach(function(path) { paths[path] = addSwaggerPassThrough(resourcePaths[path], resource); });
  }
  return addSwaggerPassThrough(paths, resources);
}

function toResponses(responses, service) {
  var result = {};
  for (var i = 0; i < responses.length; i++) {
    var response = responses[i];
    var code = response.code.integer ? response.code.integer.value : response.code.response_code_option.toLowerCase();
    var headers = toHeaders(concat(service.headers, response.headers));
    if (Object.keys(headers).length == 0) headers = null;
    // Note: Response.description is required in Swagger, but not in Apibuilder - thus the `|| code + " response"` below.
    result[code] = addSwaggerPassThrough({
      "description": response.description || code + " response",
      "schema": toDefinitionSchema(response.type, service),
      "headers": headers
    }, response);
  }
  return addSwaggerPassThrough(result, responses);
}

function addSwaggerPassThrough(swaggerDoc, apiDocObj) {
  if (apiDocObj.attributes) {
    var swaggerAttr = apiDocObj.attributes.find(function(attr) { return attr.name == 'swagger' });
    if (swaggerAttr) {
      return concat(swaggerAttr.value, swaggerDoc);
    }
  }
  return swaggerDoc;
}

function toSwagger(service) {
  var url = !service.base_url || service.base_url.trim() === "" ? {} : Url.parse(service.base_url);
  var schemes = [(url.protocol || '').replace(/:$/, '')];
  if ((schemes.length == 1 && schemes[0] === '') || schemes.length == 0) schemes = null;
  return addSwaggerPassThrough({
    "swagger": "2.0",
    "info": {
      "title": service.name,
      "description": service.description,
      "contact": toContact(service.info.contact),
      "license": toLicense(service.info.license),
      "version": service.version
    },
    "host": url.host,
    "basePath": url.pathname,
    "schemes": schemes,
    "consumes": ["application/json"],
    "produces": ["application/json"],
    "paths": toPaths(service.resources, service),
    "definitions": concat(toDefinitions(service.models, service), toDefinitionsFromUnions(service.unions, service))
  }, service);
}

// object2 will override collisions from object1
function concat(object1, object2) {
  if (!object1) return object2;
  if (!object2) return object1;
  return Object.assign({}, object1, object2);
}

function unwindArray(type) {
  var arrayType = type.match(/^\s*\[\s*(.+)\s*\]\s*$/);
  if (arrayType) {
    return {
      isArray: true,
      type: arrayType[1]
    }
  } else {
    return {
      isArray: false,
      type: type
    }
  }
}

function doResponse(response, context) {
  const source = JSON.stringify(response);
  context.succeed({
    statusCode: 200,
    body: JSON.stringify({
      source: source,
      files: [
        {
          name: "swagger.json",
          contents: source
        }
      ]
    })
  });
}

function removeNulls(obj) {
  Object.keys(obj).forEach(function(key) {
    (obj[key] && typeof obj[key] === 'object') && removeNulls(obj[key]) ||
    (obj[key] === null) && delete obj[key]
  });
  return obj;
};
