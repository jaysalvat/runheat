import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { app } from './lib/app.svelte.js';
import { mapCtl } from './lib/mapctl.js';

mount(App, { target: document.getElementById('app') });

// Exposed for debugging from the browser console in dev
if (import.meta.env.DEV) Object.assign(window, { app, mapCtl });
