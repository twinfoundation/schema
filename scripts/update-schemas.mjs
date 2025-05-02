// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
/**
 * This script is used to perform actions across the whole repo.
 * It is much like using the --workspaces option for npm commands,
 * but it fails fast when there is an error.
 */
import path from 'node:path';
import FastGlob from 'fast-glob';
import { loadJson, saveJson } from './common.mjs';
import { readFile, unlink, writeFile } from 'node:fs/promises';

/**
 * Execute the process.
 */
async function run() {
	process.stdout.write('Update Schemas\n');
	process.stdout.write('==========\n');
	process.stdout.write('\n');
	process.stdout.write(`Platform: ${process.platform}\n`);
	process.stdout.write('\n');

	const schemas = await loadJson('schemas.json');

	for (const schema of schemas) {
		const packages = schema.packages ?? [];
		let types = schema.types ?? [];

		const hasTypes = types.length > 0 || packages.length > 0;

		if (hasTypes) {
			const outputPath = path.join('web', schema.namespace);

			process.stdout.write(`Schema: ${schema.title}\n`);

			if (types.length === 0) {
				process.stdout.write(`   Cleanup existing types\n`);
				const existingFiles = await FastGlob(`*.json`, { cwd: outputPath });

				for (const file of existingFiles) {
					const filePath = path.join(outputPath, file);
					process.stdout.write(`      Deleting: ${filePath}\n`);
					await unlink(filePath);
				}
				for (const pkg of packages) {
					const packagePath = path.resolve(path.join('../', schema.repo, 'packages', pkg));
					process.stdout.write(`   Package: ${packagePath}\n`);
					const tsToOpenApi = await loadJson(path.join(packagePath, 'ts-to-schema.json'));
					types.push(...tsToOpenApi.types);

					process.stdout.write(`      Copying types\n`);
					for (const type of tsToOpenApi.types) {
						const sourcePath = path.join(
							packagePath,
							'src',
							'schemas',
							`${stripInterface(type)}.json`
						);
						process.stdout.write(`         Copying type: ${sourcePath}\n`);

						const typeContent = await loadJson(sourcePath);
						const typeOutputPath = path.join(outputPath, `${stripInterface(type)}.json`);
						await saveJson(typeOutputPath, typeContent);
					}
				}
			}

			const typesPage = await generateTypesPage(schema.title, schema.namespace, types);

			process.stdout.write(`   Generate types page\n`);
			await writeFile(path.join(outputPath, 'types.html'), typesPage, 'utf-8');
			process.stdout.write('\n');
		}
	}

	await createRewriteRules(schemas);

	process.stdout.write('Done\n');
}

/**
 * Generate the types page.
 * @param title The title of the page.
 * @param namespace The namespace of the page.
 * @param types The types to include in the page.
 * @returns The generated types page.
 */
async function generateTypesPage(title, namespace, types) {
	let template = await readFile(path.join('templates', 'types.html'), 'utf-8');
	template = template.replace(/\${title}/g, title);
	template = template.replace(/\${namespace}/g, namespace);
	template = template.replace(
		/\${types}/g,
		types
			.map(
				type => `\t\t\t\t<li>
\t\t\t\t\t<a href="./${stripInterface(type)}.json">${stripInterface(type)}</a>
\t\t\t\t</li>
`
			)
			.join('')
			.trim()
	);
	return template;
}

/**
 * Write the config containing the rewrite rules.
 * @param schemas The schemas to include in the rewrites.
 */
async function createRewriteRules(schemas) {
	process.stdout.write('Write rewrites file\n');
	process.stdout.write('\n');

	const allSchemas = [{ namespace: 'common' }, ...schemas];
	const rewrites = [];

	for (const schema of allSchemas) {
		const rewriteName = schema.namespace;

		const packages = schema.packages ?? [];
		const types = schema.types ?? [];
		const hasTypes = types.length > 0 || packages.length > 0;

		if (hasTypes) {
			rewrites.push({
				source: `/${rewriteName}/`,
				has: [
					{
						type: 'header',
						key: 'Accept',
						value: 'text/html.*'
					}
				],
				destination: `https://schema.twindev.org/${rewriteName}/types.html`
			});
		}
		rewrites.push({
			source: `/${rewriteName}/`,
			has: [
				{
					type: 'header',
					key: 'Accept',
					value: 'application/ld\\+json.*'
				}
			],
			destination: `https://schema.twindev.org/${rewriteName}/types.jsonld`
		});
		if (hasTypes) {
			rewrites.push({
				source: `/${rewriteName}/:path*`,
				missing: [
					{
						type: 'header',
						key: 'Accept',
						value: 'application/ld\\+json.*'
					}
				],
				destination: `https://schema.twindev.org/${rewriteName}/:path*.json`
			});
		}
	}
	const rewritesPath = path.join('web', 'vercel.json');
	await saveJson(rewritesPath, { rewrites });
}

/**
 * Remove an "I" from the start of the string if it is followed by a capital letter.
 * @param typeString The string to check.
 * @returns The string without the "I" at the start.
 */
function stripInterface(typeString) {
	if (/I[A-Z]/.test(typeString)) {
		return typeString.slice(1);
	}

	return typeString;
}

run().catch(err => {
	process.stderr.write(`${err}\n`);
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
});
