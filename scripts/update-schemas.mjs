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
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';

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

		const outputPath = path.join('web', schema.namespace);
		process.stdout.write(`Schema: ${schema.title}\n`);

		await mkdir(outputPath, { recursive: true });

		if (hasTypes) {
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
					const tsToSchema = await loadJson(path.join(packagePath, 'ts-to-schema.json'));
					types.push(...tsToSchema.types.map(t => typeSourceToType(t)));

					process.stdout.write(`      Copying types\n`);
					for (const typeSource of tsToSchema.types) {
						const type = typeSourceToType(typeSource);

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
		}
		const typesPage = await generateTypesPage(schema, types);

		process.stdout.write(`   Generate types page\n`);
		await writeFile(path.join(outputPath, 'types.html'), typesPage, 'utf-8');
		process.stdout.write('\n');
	}

	await createRewriteRules(schemas);

	process.stdout.write('Done\n');
}

/**
 * Generate the types page.
 * @param schema The schema being created
 * @param namespace The namespace of the page.
 * @param types The types to include in the page.
 * @returns The generated types page.
 */
async function generateTypesPage(schema, types) {
	let template = await readFile(path.join('templates', 'types.html'), 'utf-8');
	template = template.replace(/\${title}/g, schema.title);
	template = template.replace(/\${namespace}/g, schema.namespace);

	if ((schema.repo ?? '').length === 0) {
		template = template.replace(/\${repo}/g, '');
	} else {
		template = template.replace(
			/\${repo}/g,
			`Repo: <a href="https://github.com/twinfoundation/${schema.repo}" target="_blank">https://github.com/twinfoundation/${schema.repo}</a><br /><br /><hr /><br />`
		);
	}

	if ((schema.description ?? '').length === 0) {
		template = template.replace(/\${description}/g, '');
	} else {
		template = template.replace(/\${description}/g, `<p>${schema.description}</p><br />`);
	}

	if (types.length === 0) {
		template = template.replace(/\${jsonSchemas}/g, '');
	} else {
		const typesList = types
			.map(type => `<li><a href="./${stripInterface(type)}.json">${stripInterface(type)}</a></li>`)
			.join('')
			.trim();

		const jsonSchemas = `<h2>JSON Schemas</h2>
			<br />
			<p>
				<b>Root namespace:</b>
				https://schema.twindev.org/${schema.namespace}/
			</p>
			<br /><ul>${typesList}</ul><br /><hr /><br /><br />`;

		template = template.replace(/\${jsonSchemas}/g, jsonSchemas);
	}

	const allTypes = schema.jsonLdTypes ?? ['types'];

	let jsonLdOutput = '';
	if (allTypes.length > 0) {
		const jsonLdList = allTypes
			.map(
				t =>
					`<li><a href="./${t}.jsonld">https://schema.twindev.org/${schema.namespace}/${t}.jsonld</a></li>`
			)
			.join('');

		jsonLdOutput = `<h2>JSON-LD</h2><br /><ul>${jsonLdList}</ul>`;
	} else if (schema.jsonLdLink) {
		jsonLdOutput = `<h2>JSON-LD</h2><br /><a href="${schema.jsonLdLink}" target="_blank">${schema.jsonLdLink}</a>`;
	}
	template = template.replace(/\${jsonLd}/g, jsonLdOutput);

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
		const jsonLdTypes = schema.jsonLdTypes;

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
		if (Array.isArray(jsonLdTypes)) {
			for (const type of jsonLdTypes) {
				rewrites.push({
					source: `/${rewriteName}/${type}.jsonld`,
					has: [
						{
							type: 'header',
							key: 'Accept',
							value: 'application/ld\\+json.*'
						}
					],
					destination: `https://schema.twindev.org/${rewriteName}/${type}.jsonld`
				});
			}
		} else {
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
		}
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

/**
 * Convert a type source to a type.
 * @param typeSource The source type to convert.
 * @returns The converted type.
 */
function typeSourceToType(typeSource) {
	const typeSourceParts = typeSource.split('/');
	const camelCaseType = typeSourceParts[typeSourceParts.length - 1].replace(/(\.d)?\.ts$/, '');
	return camelCaseType[0].toUpperCase() + camelCaseType.slice(1);
}

run().catch(err => {
	process.stderr.write(`${err}\n`);
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit(1);
});
