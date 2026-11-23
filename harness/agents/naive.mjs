// A first-draft agent: it gets through every screen, but takes the first row, the first line and the answer
// that helps the request. It is here so the report has something realistic to show beside the reference agent.
import { run } from './reference.mjs';

export const agent = (page, task) => run(page, task, false);
