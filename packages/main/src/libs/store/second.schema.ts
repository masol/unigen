import { Schema } from 'electron-store';
import { SecondConfig } from '$types/appconfig.js';

export const secondSchema: Schema<SecondConfig> = {
    "recents": {
        "type": "array",
        default: [],
        "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["path", "time"],
            "properties": {
                "path": {
                    "type": "string",
                },
                "type": {
                    "type": "string",
                },
                "time": {
                    "type": "number",
                }
            },
        }
    }
};
