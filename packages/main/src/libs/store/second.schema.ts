import { SecondConfig } from '$types/appconfig.js';
import { Schema } from 'electron-store';

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
                "icon": {
                    "type": "string",
                },
                "time": {
                    "type": "number",
                }
            },
        }
    }
};
