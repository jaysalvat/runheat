import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { app } from './lib/app.svelte.js';
import { mapCtl } from './lib/mapctl.js';

mount(App, { target: document.getElementById('app') });

// handy in the browser console while developing
if (import.meta.env.DEV) Object.assign(window, { app, mapCtl });
