const Url = require('url');

exports.handler = (event, context, callback) => {
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
  var arrayType = type.match(/^\s*\[\s*(.+)\s*\]\s*$/);
  if (arrayType) {
    return {
      "type": "array",
      "items": toDefinitionOrEnum(arrayType[1], service)
    }
  } else {
    return toDefinitionOrEnum(type, service);
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

function toSchema(model, service) {
  var schema = {
    "type": "object",
    "description": model.description,
    "title": model.name,
    "required": model.fields.filter(function(field) { return field.required || field.required === undefined; }).map(function(field) { return field.name; }),
    "properties": {}
  };
  for (var i = 0; i < model.fields.length; i++) {
    var field = model.fields[i];
    var property = undefined;
    var dataType = toTypeAndFormat(field.type);
    if (dataType) {
      property = {
        "type": dataType.type,
        "format": dataType.format,
        "description": field.description,
        "default": field.default,
        "maximum": field.maximum,
        "minimum": field.minimum,
        "example": field.example
      }
    } else {
      property = toDefinitionSchema(field.type, service);
    }
    schema.properties[field.name] = addSwaggerPassThrough(property, field);
  }
  return addSwaggerPassThrough(schema, model);
}

function toTypeAndFormat(type) {
  switch (type) {
    case "boolean":
      return { "type": "boolean" };
    case "date-iso8601":
      return { "type": "string", "format": "date" };
    case "date-time-iso8601":
      return { "type": "string", "format": "date-time" };
    case "decimal":
      return { "type": "number", "format": "float" };
    case "double":
      return { "type": "number", "format": "double" };
    case "integer":
      return { "type": "integer", "format": "int32" };
    case "long":
      return { "type": "integer", "format": "int64" };
    case "object":
      return { };
    case "string":
      return { "type": "string" };
    case "unit":
      return { };
    case "uuid":
      return { "type": "string", "format": "uuid" };
  }
}

function toParameters(parameters) {
  return parameters.map(function(parameter) {
    var dataType = toTypeAndFormat(parameter.type);
    return addSwaggerPassThrough({
      "name": parameter.name,
      "in": parameter.location.toLowerCase(),
      "description": parameter.description,
      "required": parameter.required,
      "format": dataType.format,
      "type": dataType.type,
      "default": parameter.default,
      "maximum": parameter.maximum,
      "minimum": parameter.minimum
    }, parameter)
  });
}

function toPaths(resources, service) {
  var paths = {};
  for (var i = 0; i < resources.length; i++) {
    var resource = resources[i];
    var operations = {};
    for (var j = 0; j < resource.operations.length; j++) {
      var operation = resource.operations[j];
      var parameters = toParameters(operation.parameters);
      var bodyParameter = toBodyParameter(operation.body, service);
      if (bodyParameter) parameters.push(bodyParameter);
      operations[operation.method.toLowerCase()] = addSwaggerPassThrough({
        "description": operation.description,
        "parameters": parameters,
        "responses": toResponses(operation.responses, service),
      }, operation);
    }
    paths[resource.path || resource.operations[0].path] = addSwaggerPassThrough(operations, resource);
  }
  return addSwaggerPassThrough(paths, resources);
}

function toResponses(responses, service) {
  var result = {};
  for (var i = 0; i < responses.length; i++) {
    var response = responses[i];
    var code = response.code.integer ? response.code.integer.value : response.code.response_code_option.toLowerCase();
    result[code] = addSwaggerPassThrough({
      "description": response.description,
      "schema": toDefinitionSchema(response.type, service)
    }, response);
  }
  return addSwaggerPassThrough(result, responses);
}

function addSwaggerPassThrough(swaggerDoc, apiDocObj) {
  if (apiDocObj.attributes) {
    var swaggerAttr = apiDocObj.attributes.find(function(attr) { return attr.name == 'swagger' });
    if (swaggerAttr) {
      return Object.assign({}, swaggerAttr.value, swaggerDoc);
    }
  }
  return swaggerDoc;
}

function toSwagger(service) {
  var url = !service.base_url || service.base_url.trim() === "" ? {} : Url.parse(service.base_url);
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
    "schemes": [(url.protocol || '').replace(/:$/, '')],
    "consumes": ["application/json"],
    "produces": ["application/json"],
    "paths": toPaths(service.resources, service),
    "definitions": Object.assign(toDefinitions(service.models, service), toDefinitionsFromUnions(service.unions, service))
  }, service);
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
