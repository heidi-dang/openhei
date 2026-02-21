import { expect, test } from "bun:test";
import { parseAndSanitizeMarkdown } from "./content-markdown";

test("parseAndSanitizeMarkdown sanitizes malicious HTML", async () => {
  const malicious = '<img src=x onerror=alert(1)>';
  const sanitized = await parseAndSanitizeMarkdown(malicious);
  console.log('Sanitized output:', sanitized);
  expect(sanitized).not.toContain("onerror");
  expect(sanitized).not.toContain("alert");
  // DOMPurify typically keeps safe tags but removes dangerous attributes
  expect(sanitized).toContain('src="x"');
});

test("parseAndSanitizeMarkdown handles normal markdown", async () => {
  const markdown = "# Hello\n\n[Link](https://example.com)";
  const html = await parseAndSanitizeMarkdown(markdown);
  expect(html).toContain('<h1>Hello</h1>');
  expect(html).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">Link</a>');
});
