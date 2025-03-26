// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

import mappings from "./mappings.json" assert { type: "json" };
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export abstract class LdContexts {
    public static list(): string[] {
        return Object.keys(mappings);
    }

    public static exists(uri: string): boolean {
        const theMappings = mappings as { [id: string]: string }

        return typeof theMappings[uri] === "string";
    }

    public static async get(uri: string): Promise<string> {
        if (!this.exists(uri)) {
            throw new Error(`Not_Found: ${uri}`);
        }

        const theMappings = mappings as { [id: string]: string }
        const fileName = theMappings[uri];

        const filename = fileURLToPath(import.meta.url);
        const dirnameStr = path.dirname(filename);

        const pathToFile = path.join(
            dirnameStr,
            "..",
            "json-ld",
            fileName
        );

        const contentBuffer = await fs.readFileSync(pathToFile);
        const content = contentBuffer.toString();
        return content;
    }
}