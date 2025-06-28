import './polyfills.js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { sseManager } from './sse/index.js';
import { ILogger } from "@digital-alchemy/core";
import express from 'express';
import { rateLimiter, securityHeaders, validateRequest, sanitizeInput, errorHandler } from './security/index.js';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production'
  ? '.env'
  : process.env.NODE_ENV === 'test'
    ? '.env.test'
    : '.env.development';

console.log(`Loading environment from ${envFile}`);
config({ path: resolve(process.cwd(), envFile) });

import { get_hass } from './hass/index.js';
import { LiteMCP } from 'litemcp';
import { z } from 'zod';
import { DomainSchema } from './schemas.js';

// Configuration
const HASS_HOST = process.env.HASS_HOST || 'http://192.168.178.63:8123';
const HASS_TOKEN = process.env.HASS_TOKEN;
const PORT = process.env.PORT || 3000;

console.log('Initializing Home Assistant connection...');

// Initialize Express app
const app = express();
// Trust NGINX Proxy Manager + Docker bridge proxy for correct client IP identification
app.set('trust proxy', 2);

// Apply security middleware
app.use(securityHeaders);
app.use(rateLimiter);
app.use(express.json());
app.use(validateRequest);
app.use(sanitizeInput);

// Initialize LiteMCP
const server = new LiteMCP('home-assistant', '0.1.0');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// Define Tool interface
interface Tool {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (params: any) => Promise<any>;
}

// Array to track tools
const tools: Tool[] = [];

// List devices endpoint
app.get('/list_devices', async (req, res) => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || token !== HASS_TOKEN) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Invalid token'
      });
    }

    const tool = tools.find(t => t.name === 'list_devices');
    if (!tool) {
      return res.status(404).json({
        success: false,
        message: 'Tool not found'
      });
    }

    const result = await tool.execute({ token });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

app.post('/control', async (req, res) => {
  try {
    // Get token from Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token || token !== HASS_TOKEN) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Invalid token'
      });
    }

    const tool = tools.find(t => t.name === 'control');
    if (!tool) {
      return res.status(404).json({
        success: false,
        message: 'Tool not found'
      });
    }

    const result = await tool.execute({
      ...req.body,
      token
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// SSE endpoints
app.get('/subscribe_events', (req, res) => {
  try {
    // Get token from query parameter
    const token = req.query.token?.toString();

    if (!token || token !== HASS_TOKEN) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Invalid token'
      });
    }

    const tool = tools.find(t => t.name === 'subscribe_events');
    if (!tool) {
      return res.status(404).json({
        success: false,
        message: 'Tool not found'
      });
    }

    tool.execute({
      token,
      events: req.query.events?.toString().split(','),
      entity_id: req.query.entity_id?.toString(),
      domain: req.query.domain?.toString(),
      response: res
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

app.get('/get_sse_stats', async (req, res) => {
  try {
    // Get token from query parameter
    const token = req.query.token?.toString();

    if (!token || token !== HASS_TOKEN) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Invalid token'
      });
    }

    const tool = tools.find(t => t.name === 'get_sse_stats');
    if (!tool) {
      return res.status(404).json({
        success: false,
        message: 'Tool not found'
      });
    }

    const result = await tool.execute({ token });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown errorOccurred'
    });
  }
});

// Error handling middleware
app.use(errorHandler);

// ... rest of file unchanged ...

// Start the Express server
app.listen(PORT, () => {
  logger.info('[server:init]', `Express server listening on port ${PORT}`);
});
