const { HttpError, ValidationError } = require("../http/io");
const { LOCALES, PAGE_IDS, MAX_MARKDOWN_LENGTH, renderMarkdown } = require("../domain/documentation");
const repository = require("../db/repositories/documentation");

function validateParams({ locale, id }) {
  if (!LOCALES.includes(locale) || (id !== undefined && !PAGE_IDS.includes(id))) {
    throw new HttpError(404, "documentation.notFound");
  }
}

function validatedText(value, max, allowEmpty = false) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim()) || value.includes("\0")) {
    throw new ValidationError("documentation.invalidContent");
  }
  return value;
}

function renderedPage(page) {
  return { ...page, ...renderMarkdown(page.markdown) };
}

async function list({ client, params }) {
  validateParams(params);
  return { pages: await repository.list(client, params.locale) };
}

async function get({ client, params }) {
  validateParams(params);
  const page = await repository.get(client, params.locale, params.id);
  if (!page) throw new HttpError(404, "documentation.notFound");
  return { page: renderedPage(page) };
}

async function preview({ body }) {
  return renderMarkdown(validatedText(body.markdown, MAX_MARKDOWN_LENGTH, true));
}

async function update({ client, user, params, body }) {
  validateParams(params);
  const content = {
    title: validatedText(body.title, 160).trim(),
    summary: validatedText(body.summary, 400).trim(),
    markdown: validatedText(body.markdown, MAX_MARKDOWN_LENGTH),
    version: body.version
  };
  if (!Number.isSafeInteger(content.version) || content.version < 1) throw new ValidationError("documentation.invalidContent");
  const page = await repository.update(client, params.locale, params.id, content, user.id);
  if (!page) throw new HttpError(409, "documentation.conflict");
  return { page: renderedPage(page) };
}

module.exports = { list, get, preview, update };
