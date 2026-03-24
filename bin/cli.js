#!/usr/bin/env node

/**
 * nestjs-master-skills CLI
 */

const fs = require('fs');
const path = require('path');

const SKILLS_SOURCE = path.join(__dirname, '..', 'skills');
const SKILLS_DEST = path.join(process.cwd(), '.claude', 'skills', 'nestjs');
const SKILL_INDEX = path.join(process.cwd(), '.claude', 'skills', 'nestjs', 'SKILL.md');

// Màu sắc đặc trưng của NestJS
const RED = '\x1b[31m';
const WHITE = '\x1b[37m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';

const COMMANDS = {
  init: 'init',
  list: 'list',
};

// Logo ASCII NestJS
const NEST_LOGO = `
${RED}            _                 _  ${WHITE}     _ 
${RED}  _ __  ___| |_ __ _ ___    | |${WHITE} ___| |
${RED} | '_ \\/ _ \\ __/ _\` / __|${WHITE} _ | |/ __| |
${RED} | | | \\  __/ |_| (_| \\__ \\${WHITE}| |_| \\__ \\ |
${RED} |_| |_|\\___|\\__\\__,_|___/${WHITE} \\___/|___/_|
${RESET}`;

function printLogo() {
  console.log(NEST_LOGO);
  console.log(`  ${BOLD}${RED}NESTJS${RESET} ${WHITE}MASTER SKILLS CLI${RESET}\n`);
}

function info(text) { console.log(`  ${text}`); }
function success(text) { console.log(`  ${GREEN}✓${RESET} ${text}`); }
function warn(text) { console.log(`  ${YELLOW}⚠${RESET} ${text}`); }
function error(text) { console.error(`  ${RED}✗${RESET} ${text}`); }

function header(text) {
  console.log(`  ${RED}»${RESET} ${BOLD}${text.toUpperCase()}${RESET}\n`);
}

// ... (giữ nguyên các hàm copyFile, copyDir như cũ)

function listSkills() {
  printLogo();
  header('Available Skills');

  if (!fs.existsSync(SKILLS_SOURCE)) {
    error('Source skills directory not found.');
    return;
  }

  const skills = fs.readdirSync(SKILLS_SOURCE)
    .filter(f => f.endsWith('.md'))
    .sort();

  for (const skill of skills) {
    const skillPath = path.join(SKILLS_SOURCE, skill);
    const content = fs.readFileSync(skillPath, 'utf8');
    const match = content.match(/description:\s*>\s*([^\n]+)/);
    const desc = match ? match[1].trim().substring(0, 60) + '...' : 'NestJS expert capability';
    
    console.log(`  ${RED}●${RESET} ${BOLD}${skill.replace('.md', '').padEnd(20)}${RESET} ${desc}`);
  }
  console.log();
}

function init(targetDir) {
  const dest = targetDir || SKILLS_DEST;
  printLogo();
  header('Initializing Skills');

  info(`${BOLD}Source:${RESET} ${SKILLS_SOURCE}`);
  info(`${BOLD}Target:${RESET} ${dest}\n`);

  if (fs.existsSync(SKILL_INDEX) && !process.argv.includes('--force')) {
    warn('Skills already exist. Use --force to overwrite.');
    return;
  }

  fs.mkdirSync(dest, { recursive: true });
  const skills = fs.readdirSync(SKILLS_SOURCE).filter(f => f.endsWith('.md'));

  skills.forEach(skill => {
    try {
      const src = path.join(SKILLS_SOURCE, skill);
      const destFile = path.join(dest, skill);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(src, destFile);
      success(`Deployed: ${skill}`);
    } catch (err) {
      error(`Failed: ${skill} (${err.message})`);
    }
  });

  console.log(`\n  ${GREEN}${BOLD}Successfully initialized ${skills.length} skills!${RESET}`);
  info('1. Restart Claude Code to sync.');
  info(`2. Location: ${dest}\n`);
}

function help() {
  printLogo();
  header('CLI Usage');
  info(`${BOLD}npx nestjs-master-skills init${RESET}      Setup skills`);
  info(`${BOLD}npx nestjs-master-skills list${RESET}      View all skills`);
  info(`${BOLD}npx nestjs-master-skills --help${RESET}   Show this menu\n`);
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args.find(a => !a.startsWith('--'));
  const flags = args.filter(a => a.startsWith('--'));

  if (flags.includes('--help') || flags.includes('-h') || args.length === 0) {
    help();
    return;
  }

  if (cmd === COMMANDS.list) {
    listSkills();
  } else if (cmd === COMMANDS.init) {
    const targetFlag = args.find(a => a.startsWith('--target='));
    const targetDir = targetFlag ? path.resolve(targetFlag.split('=')[1]) : null;
    init(targetDir);
  } else {
    help();
  }
}

main();