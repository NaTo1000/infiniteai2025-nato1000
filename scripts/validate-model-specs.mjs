import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import process from 'node:process';

const repositoryRoot = resolve(import.meta.dirname, '..');
const requiredModelFields = [
  'model_type',
  'architectures',
  'hidden_size',
  'num_hidden_layers',
  'num_attention_heads',
  'vocab_size',
  'max_position_embeddings',
  'system_prompt',
];

const errors = [];
const warnings = [];

function reportError(message) {
  errors.push(message);
}

function reportWarning(message) {
  warnings.push(message);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

async function listModelDirectories() {
  const entries = await readdir(repositoryRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('nato1000-'))
    .map((entry) => entry.name)
    .sort();
}

async function validateModelDirectory(directoryName) {
  const directoryPath = resolve(repositoryRoot, directoryName);
  const configPath = resolve(directoryPath, 'config.json');
  const reportPath = resolve(directoryPath, 'report.md');

  let config;
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'));
  } catch (error) {
    reportError(`${directoryName}: config.json cannot be parsed: ${error.message}`);
    return;
  }

  for (const field of requiredModelFields) {
    if (!(field in config)) {
      reportError(`${directoryName}: config.json is missing required field '${field}'.`);
    }
  }

  if (typeof config.model_type !== 'string' || config.model_type.trim() === '') {
    reportError(`${directoryName}: model_type must be a non-empty string.`);
  }

  if (!Array.isArray(config.architectures) || config.architectures.length === 0 || !config.architectures.every((item) => typeof item === 'string' && item.trim() !== '')) {
    reportError(`${directoryName}: architectures must be a non-empty array of non-empty strings.`);
  }

  for (const field of ['hidden_size', 'num_hidden_layers', 'num_attention_heads', 'vocab_size', 'max_position_embeddings']) {
    if (!isPositiveInteger(config[field])) {
      reportError(`${directoryName}: ${field} must be a positive integer.`);
    }
  }

  if (typeof config.system_prompt !== 'string' || config.system_prompt.trim() === '') {
    reportError(`${directoryName}: system_prompt must be a non-empty string.`);
  }

  try {
    const report = await readFile(reportPath, 'utf8');
    if (!report.startsWith('# Technical Report:')) {
      reportWarning(`${directoryName}: report.md does not begin with '# Technical Report:'.`);
    }
  } catch (error) {
    reportError(`${directoryName}: report.md is unavailable: ${error.message}`);
  }
}

async function main() {
  const [majorVersion] = process.versions.node.split('.').map(Number);
  if (majorVersion !== 24) {
    reportError(`Node 24 is required for validation; detected Node ${process.versions.node}.`);
  }

  const directories = await listModelDirectories();
  if (directories.length === 0) {
    reportError('No nato1000-* model directories were found.');
  }

  await Promise.all(directories.map(validateModelDirectory));

  for (const warning of warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`ERROR: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Validated ${directories.length} AGI model specification directories with Node ${process.versions.node}.`);
  console.log(`Validated directories: ${directories.map((directory) => basename(directory)).join(', ')}`);
}

await main();
