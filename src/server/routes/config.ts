import { Router } from 'express';
import { loadAuthProfiles, loadAuthProfilesByProvider } from '../auth-profile-store.js';
import { createProvider } from '../providers/index.js';
import { readEnvConfigState, writeEnvConfig } from '../env-config.js';
import {
  collectProviderStates,
  getActiveProvider,
  getActiveProviderName,
  setActiveProvider,
} from '../provider-runtime.js';

function registerEnvConfigRoutes(router: Router) {
  router.get('/api/config/env', async (_req, res) => {
    const providers = await collectProviderStates();
    const state = await readEnvConfigState(providers);
    res.json(state);
  });

  router.put('/api/config/env', async (req, res) => {
    const { updates } = req.body || {};
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: "Missing 'updates' object." });
    }

    try {
      const targetFile = await writeEnvConfig(updates);
      const desiredProvider = process.env.AI_PROVIDER || getActiveProviderName();
      try {
        await setActiveProvider(desiredProvider);
      } catch (error) {
        console.warn(`[SSOT] Provider re-init after env save failed: ${(error as Error).message}`);
      }
      const providers = await collectProviderStates();
      const state = await readEnvConfigState(providers);
      res.json({
        success: true,
        targetFile,
        ...state,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Failed to save env config.' });
    }
  });
}

function registerProviderOnboardingRoutes(router: Router) {
  router.get('/api/ai/providers', async (_req, res) => {
    const providers = await collectProviderStates();
    res.json({ providers, active: getActiveProviderName() });
  });

  router.get('/api/ai/auth-profiles', async (req, res) => {
    const provider = typeof req.query.provider === 'string' ? req.query.provider : undefined;
    const profiles = provider ? await loadAuthProfilesByProvider(provider) : await loadAuthProfiles();
    res.json({ profiles });
  });

  router.get('/api/ai/models', async (req, res) => {
    const targetProvider = req.query.provider as string | undefined;
    const authProfile = typeof req.query.authProfile === 'string' ? req.query.authProfile : undefined;

    try {
      const targetP = targetProvider ? createProvider(targetProvider) : getActiveProvider();

      const models = await targetP.listModels(authProfile ? { authProfile } : undefined);
      const defaultSuffix = targetP.defaultModel.includes('/')
        ? targetP.defaultModel
        : `/${targetP.defaultModel}`;
      const namespacedDefault = models.find((model) => model.id.endsWith(defaultSuffix))?.id;
      const resolvedDefaultModel = models.some((model) => model.id === targetP.defaultModel)
        ? targetP.defaultModel
        : namespacedDefault || models[0]?.id || targetP.defaultModel;
      res.json({
        provider: targetP.name,
        authProfile: authProfile || null,
        defaultModel: resolvedDefaultModel,
        models,
      });
    } catch (e: any) {
      console.error('[SSOT] Failed to list models:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/api/ai/switch-provider', async (req, res) => {
    const { provider: newProviderName } = req.body;

    if (!newProviderName || typeof newProviderName !== 'string') {
      return res.status(400).json({ error: "Missing 'provider' field" });
    }

    try {
      const provider = await setActiveProvider(newProviderName);

      res.json({
        success: true,
        provider: provider.name,
        label: provider.label,
        defaultModel: provider.defaultModel,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
}

export function createConfigRouter() {
  const router = Router();

  registerEnvConfigRoutes(router);
  registerProviderOnboardingRoutes(router);

  return router;
}
