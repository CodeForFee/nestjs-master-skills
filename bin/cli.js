#!/usr/bin/env node

/**
 * nestjs-skills CLI
 * Usage: npx nestjs-skills init
 *        npx nestjs-skills init --target ./.claude/skills
 */

const fs = require('fs');
const path = require('path');

const SKILLS_SOURCE = path.join(__dirname, '..', 'skills');
const SKILLS_DEST = path.join(process.cwd(), '.claude', 'skills', 'nestjs');
const SKILL_INDEX = path.join(process.cwd(), '.claude', 'skills', 'nestjs', 'SKILL.md');

const COMMANDS = {
  init: 'init',
  list: 'list',
};

function green(text) {
  return `\x1b[32m${text}\x1b[0m`;
}

function yellow(text) {
  return `\x1b[33m${text}\x1b[0m`;
}

function red(text) {
  return `\x1b[31m${text}\x1b[0m`;
}

function info(text) {
  console.log(`  ${text}`);
}

function success(text) {
  console.log(`  ${green('✓')} ${text}`);
}

function warn(text) {
  console.log(`  ${yellow('⚠')} ${text}`);
}

function error(text) {
  console.error(`  ${red('✗')} ${text}`);
}

function header(text) {
  console.log(`\n  ${green(text)}\n`);
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    const srcFile = path.join(src, file);
    const destFile = path.join(dest, file);
    if (fs.statSync(srcFile).isDirectory()) {
      copyDir(srcFile, destFile);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}

function listSkills() {
  header('nestjs-skills — available skills');

  const skills = fs.readdirSync(SKILLS_SOURCE)
    .filter(f => f.endsWith('.md'))
    .sort();

  for (const skill of skills) {
    const skillPath = path.join(SKILLS_SOURCE, skill);
    // Read description from frontmatter
    const content = fs.readFileSync(skillPath, 'utf8');
    const match = content.match(/description:\s*>\s*([^\n]+)/);
    const desc = match ? match[1].trim().substring(0, 70) + '...' : 'No description';
    info(`${green(skill.replace('.md', ''))}  ${yellow(desc)}`);
  }

  console.log();
}

function init(targetDir) {
  const dest = targetDir || SKILLS_DEST;

  header('nestjs-skills init');

  info(`Source:     ${SKILLS_SOURCE}`);
  info(`Target:     ${dest}`);
  console.log();

  // Check if already initialized
  if (fs.existsSync(SKILL_INDEX) && !process.argv.includes('--force')) {
    warn('Skills already exist at destination.');
    warn('Run with --force to overwrite existing skills.');
    console.log();
    return;
  }

  // Create destination directory
  fs.mkdirSync(dest, { recursive: true });

  // Copy all skill files
  const skills = fs.readdirSync(SKILLS_SOURCE).filter(f => f.endsWith('.md'));

  for (const skill of skills) {
    const src = path.join(SKILLS_SOURCE, skill);
    const destFile = path.join(dest, skill);
    try {
      copyFile(src, destFile);
      success(`Copied: ${skill}`);
    } catch (err) {
      error(`Failed to copy ${skill}: ${err.message}`);
    }
  }

  console.log();
  header(`Initialized! ${skills.length} skill files copied.`);
  console.log('  Next steps:');
  info('  1. Restart Claude Code to load the new skills');
  info('  2. Skills are available in: .claude/skills/nestjs/');
  info('  3. Run: npx nestjs-skills list  — to see all available skills');
  console.log();
}

function help() {
  header('nestjs-skills — CLI');
  info('A comprehensive NestJS skill suite for Claude Code\n');
  console.log('  Usage:');
  info('    npx nestjs-skills init              Initialize skills in .claude/skills/nestjs/');
  info('    npx nestjs-skills init --force      Overwrite existing skills');
  info('    npx nestjs-skills init ./path       Initialize in custom directory');
  info('    npx nestjs-skills list              List all available skills');
  info('    npx nestjs-skills --help            Show this help\n');
  console.log('  Examples:');
  info('    npx nestjs-skills init');
  info('    npx nestjs-skills init --force');
  info('    npx nestjs-skills init ./some/path/.claude/skills');
  console.log();
}

// Main entry
function main() {
  const args = process.argv.slice(2);
  const cmd = args.find(a => !a.startsWith('--'));
  const flags = args.filter(a => a.startsWith('--'));

  if (flags.includes('--help') || flags.includes('-h')) {
    help();
    return;
  }

  if (cmd === COMMANDS.list) {
    listSkills();
    return;
  }

  if (cmd === COMMANDS.init || args.includes('--init')) {
    const targetFlag = args.find(a => a.startsWith('--target='));
    const targetDir = targetFlag
      ? path.resolve(targetFlag.split('=')[1])
      : null;
    init(targetDir);
    return;
  }

  // Default: show help
  help();
}

main();
