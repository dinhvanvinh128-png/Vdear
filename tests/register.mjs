/** Registers the "@/" alias resolver for the zero-install test path. */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./alias-loader.mjs', pathToFileURL(import.meta.filename));
