import fs from 'fs';
import path from 'path';

const root = process.cwd();

export function readMarkdown(relativePath: string): string {
  const filePath = path.join(root, relativePath);
  return fs.readFileSync(filePath, 'utf-8');
}

export function getFundamentalSlugs(): string[] {
  return fs
    .readdirSync(path.join(root, 'fundamentals'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.replace(/\.md$/, ''))
    .sort();
}

export function getCaseStudySlugs(): string[] {
  return fs
    .readdirSync(path.join(root, 'case-studies'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.replace(/\.md$/, ''))
    .sort();
}
