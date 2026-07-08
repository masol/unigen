{
  "fieldKey": "script",
  "intent": "最原始输入的剧本数组",
  "reducer": null,
  "storage": "flatten",
  "schema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string"
        },
        "item": {},
        "size": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "updatedAt": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        }
      },
      "required": [
        "id",
        "size",
        "updatedAt"
      ],
      "additionalProperties": {}
    }
  }
}