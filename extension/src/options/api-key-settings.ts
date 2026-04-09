import { ApiConfigStorage } from '../storage/api-config-storage';
import { ProviderId } from '../services/ai/types';
import { aiClient } from '../services/ai/ai-client';

const PROVIDERS: Record<ProviderId, string> = {
  google: 'Google Gemini',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
};

export async function initApiKeySettings() {
  const container = document.getElementById('api-keys-container');
  if (!container) return;

  const config = await ApiConfigStorage.getConfig();

  // Create input fields for each provider
  for (const [id, name] of Object.entries(PROVIDERS)) {
    const providerId = id as ProviderId;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'provider-key-wrapper';
    
    const labelRow = document.createElement('div');
    labelRow.className = 'label-row';
    
    const label = document.createElement('label');
    label.textContent = name;
    
    const validateBtn = document.createElement('button');
    validateBtn.textContent = 'Validate';
    validateBtn.className = 'btn btn--secondary btn--small';
    
    const statusIndicator = document.createElement('span');
    statusIndicator.className = 'status-indicator';
    statusIndicator.textContent = config.validationStatus[providerId] === 'valid' ? '✓ Valid' : '';
    if (config.validationStatus[providerId] === 'invalid') {
      statusIndicator.textContent = '✗ Invalid';
      statusIndicator.className = 'status-indicator status--error';
    }

    labelRow.appendChild(label);
    labelRow.appendChild(validateBtn);
    labelRow.appendChild(statusIndicator);
    
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = `Enter ${name} API Key`;
    input.className = 'input-field';
    input.dataset.provider = providerId;
    input.value = config.keys[providerId] || '';
    
    validateBtn.onclick = async () => {
      validateBtn.disabled = true;
      statusIndicator.textContent = 'Checking...';
      
      try {
        const key = (input as HTMLInputElement).value.trim();
        if (!key) {
          statusIndicator.textContent = 'Key required';
          statusIndicator.className = 'status-indicator status--error';
        } else {
          const isValid = await aiClient.validateKey(providerId, key);
          statusIndicator.textContent = isValid ? '✓ Valid' : '✗ Invalid';
          statusIndicator.className = `status-indicator ${isValid ? '' : 'status--error'}`;
          
          // Update config cache
          const config = await ApiConfigStorage.getConfig();
          config.validationStatus[providerId] = isValid ? 'valid' : 'invalid';
          await ApiConfigStorage.saveConfig(config);
        }
      } catch (e) {
        statusIndicator.textContent = 'Error';
        statusIndicator.className = 'status-indicator status--error';
      } finally {
        validateBtn.disabled = false;
      }
    };

    
    wrapper.appendChild(labelRow);
    wrapper.appendChild(input);
    container.appendChild(wrapper);
  }

  const saveBtn = document.getElementById('save-all-keys') as HTMLButtonElement;
  saveBtn.addEventListener('click', async () => {
    const inputs = container.querySelectorAll('input[data-provider]');
    const newConfig = await ApiConfigStorage.getConfig();
    
    inputs.forEach(input => {
      const id = input.dataset.provider as ProviderId;
      const val = (input as HTMLInputElement).value.trim();
      if (val) {
        newConfig.keys[id] = val;
        newConfig.validationStatus[id] = 'unverified';
      } else {
        delete newConfig.keys[id];
        delete newConfig.validationStatus[id];
      }
    });
    
    await ApiConfigStorage.saveConfig(newConfig);
    alert('Settings saved successfully!');
  });
}
