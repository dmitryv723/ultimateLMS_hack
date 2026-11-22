import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../markdown.js';
import { formatToolbar } from '../format-toolbar.js';

test('rendered markdown keeps bold, italic and strike as before', () => {
  assert.equal(renderMarkdown('**жирный** и *курсив* и ~~нет~~'),
    '<p><strong>жирный</strong> и <em>курсив</em> и <del>нет</del></p>');
});

test('toolbar underline syntax renders as ins', () => {
  assert.equal(renderMarkdown('++важный++ пункт'), '<p><ins>важный</ins> пункт</p>');
  assert.equal(renderMarkdown('обычный текст без ++'), '<p>обычный текст без ++</p>');
});

test('toolbar size syntax renders sized spans and stays escaped inside', () => {
  assert.equal(renderMarkdown('{{2:крупно}} и {{-1:мелко}}'),
    '<p><span class="md-text-2">крупно</span> и <span class="md-text--1">мелко</span></p>');
  assert.equal(renderMarkdown('{{1:<script>x</script>}}'),
    '<p><span class="md-text-1">&lt;script&gt;x&lt;/script&gt;</span></p>');
  assert.equal(renderMarkdown('{{9:за пределами}}'), '<p>{{9:за пределами}}</p>');
});

test('formatting toolbar targets its field with labeled buttons', () => {
  const toolbar = formatToolbar('answer-field');
  assert.match(toolbar, /data-format-for="answer-field"/);
  assert.match(toolbar, /data-cmd="bold" title="Полужирный"/);
  assert.match(toolbar, /data-cmd="underline"/);
  assert.match(toolbar, /data-cmd="size-up"/);
  assert.match(toolbar, /data-cmd="link"/);
  assert.match(toolbar, /type="button"/);
});
