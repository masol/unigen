{
  "fieldKey": "paragraph",
  "intent": "给剧本原文按行划分，并带上总行号。",
  "reducer": null,
  "storage": null,
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
        "index": {
          "type": "number"
        },
        "text": {
          "type": "string"
        },
        "ests": {
          "type": "number"
        }
      },
      "required": [
        "id",
        "index",
        "text",
        "ests"
      ],
      "additionalProperties": {}
    }
  }
}