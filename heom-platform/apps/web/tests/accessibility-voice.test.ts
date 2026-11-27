import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccessibilityVoiceCommand } from '../src/lib/accessibility-voice.ts';

test('reconhece o comando direto para ler opções', () => {
  assert.equal(parseAccessibilityVoiceCommand('Ler opções'), 'READ_OPTIONS');
});

test('reconhece variações com acentos e palavras de cortesia', () => {
  assert.equal(parseAccessibilityVoiceCommand('Por favor, leia as opções de acessibilidade'), 'READ_OPTIONS');
  assert.equal(parseAccessibilityVoiceCommand('Pode ler os ajustes?'), 'READ_OPTIONS');
});

test('reconhece comandos para interromper a leitura', () => {
  assert.equal(parseAccessibilityVoiceCommand('Parar leitura'), 'STOP_READING');
  assert.equal(parseAccessibilityVoiceCommand('Interrompa a fala'), 'STOP_READING');
  assert.equal(parseAccessibilityVoiceCommand('PARAR'), 'STOP_READING');
});

test('não interpreta falas desconhecidas como comandos', () => {
  assert.equal(parseAccessibilityVoiceCommand('Abrir inventário'), 'UNKNOWN');
  assert.equal(parseAccessibilityVoiceCommand('Bom dia'), 'UNKNOWN');
});
