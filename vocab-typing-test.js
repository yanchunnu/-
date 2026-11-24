/* Shared typing test for the HSK vocabulary study pages.
   Expects window.vocabPages (the same page array the audio view uses).
   Example-sentence prompts use word.exampleKo when that Korean translation exists. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VocabTypingTest = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { api.mount(); });
    } else {
      api.mount();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KO_KEYS = ['exampleKo', 'exampleKorean', 'example_ko', 'exampleMeaning'];
  const SENTENCE_PUNCT = /[.!?。！？，,、：:；;…~～"'“”‘’()（）\[\]【】{}｛｝《》「」『』．]/u;
  function flatten(pages) {
    const items = [];
    let bookNo = 1;
    (pages || []).forEach(function (page) {
      (page.words || []).forEach(function (word, index) {
        items.push({
          bookNo: bookNo,
          localNo: index + 1,
          page: page.page,
          category: page.category || '',
          id: word.id,
          word: word.word || '',
          spoken: word.spoken || '',
          pinyin: word.pinyin || '',
          meaning: word.meaning || '',
          example: word.example || '',
          exampleKo: exampleKorean(word)
        });
        bookNo += 1;
      });
    });
    return items;
  }

  function exampleKorean(word) {
    for (let i = 0; i < KO_KEYS.length; i++) {
      const value = word[KO_KEYS[i]];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  }

  function normalizeSentence(value) {
    const mapped = String(value || '').normalize('NFKC').replace(/。/g, '.');
    let out = '';
    for (const ch of mapped) {
      if (/\s/u.test(ch)) continue;
      out += /[A-Za-z]/.test(ch) ? ch.toLowerCase() : ch;
    }
    return out;
  }

  function isSentencePunct(ch) {
    return !!ch && SENTENCE_PUNCT.test(ch);
  }

  function sentencesMatch(expected, given) {
    const exp = normalizeSentence(expected);
    const got = normalizeSentence(given);
    if (!got || !exp) return false;
    if (exp === got) return true;
    if (isSentencePunct(exp.slice(-1)) && exp.slice(0, -1) === got) return true;
    // 福气。” can be answered as 福气” by leaving out the period inside the closing quote.
    const tail = exp.match(/^(.*?)([.!?])(["”’')\]]+)$/u);
    if (tail && tail[1] + tail[3] === got) return true;
    return false;
  }

  function expandWord(source) {
    const normalized = String(source || '').normalize('NFKC').replace(/[\s\u3000]/g, '');
    const withoutIndex = normalized.replace(/(\p{Script=Han})\d+/gu, '$1');
    const tokens = [];
    const re = /\(([^)]*)\)|[^()]+/g;
    let match;
    while ((match = re.exec(withoutIndex))) {
      if (match[0].charAt(0) === '(') tokens.push({ optional: match[1] });
      else tokens.push({ text: match[0] });
    }
    if (!tokens.length) return withoutIndex ? [withoutIndex] : [];
    const optionalCount = tokens.filter(function (token) { return token.optional !== undefined; }).length;
    const forms = [];
    const limit = 1 << optionalCount;
    for (let mask = 0; mask < limit; mask++) {
      let optionalIndex = 0;
      let text = '';
      tokens.forEach(function (token) {
        if (token.optional !== undefined) {
          if (mask & (1 << optionalIndex)) text += token.optional;
          optionalIndex += 1;
        } else {
          text += token.text;
        }
      });
      if (text) forms.push(text);
    }
    return forms;
  }

  function wordForms(item) {
    const forms = new Set();
    expandWord(item.spoken).forEach(function (form) { forms.add(form); });
    expandWord(item.word).forEach(function (form) { forms.add(form); });
    return forms;
  }

  function normalizeWordAnswer(value) {
    return String(value || '')
      .normalize('NFKC')
      .replace(/[\s\u3000]/g, '')
      .replace(/[()]/g, '')
      .replace(/(\p{Script=Han})\d+/gu, '$1');
  }

  function wordMatches(item, given) {
    const answer = normalizeWordAnswer(given);
    if (!answer) return false;
    return wordForms(item).has(answer);
  }

  function displayWord(item) {
    const forms = Array.from(wordForms(item));
    const spoken = normalizeWordAnswer(item.spoken);
    const ordered = spoken && forms.indexOf(spoken) !== -1
      ? [spoken].concat(forms.filter(function (form) { return form !== spoken; }))
      : forms;
    return ordered.join(' 또는 ');
  }

  function shouldSubmitOnEnter(event, state) {
    if (!event || event.key !== 'Enter') return false;
    if (event.isComposing || state.composing || event.keyCode === 229) return false;
    if (state.blockEnterUntil && state.now < state.blockEnterUntil) return false;
    return true;
  }

  function scoreOutOf100(correct, total) {
    if (!total) return 0;
    return Math.round((correct / total) * 100);
  }

  function mount() {
    const pages = globalThis.vocabPages;
    const main = document.querySelector('main');
    const list = document.getElementById('words');
    if (!main || !list || !pages || document.getElementById('typing-test')) return;

    const items = flatten(pages);
    const total = items.length;
    if (!total) return;

    const stats = main.querySelector('h1') ? main.querySelector('h1').nextElementSibling : null;
    const downloads = main.querySelector('.downloads');
    const listen = document.createElement('div');
    listen.id = 'listen';
    const anchor = stats && stats.parentNode === main ? stats.nextSibling : main.firstChild;
    let node = anchor;
    while (node && node !== downloads) {
      const next = node.nextSibling;
      listen.appendChild(node);
      node = next;
    }
    main.insertBefore(listen, downloads || null);

    const switcher = document.createElement('div');
    switcher.className = 'mode-switch';
    switcher.setAttribute('role', 'tablist');
    switcher.innerHTML = [
      '<button type="button" id="mode-listen" role="tab" aria-selected="true">음원 학습</button>',
      '<button type="button" id="mode-word" role="tab" aria-selected="false">단어 시험</button>',
      '<button type="button" id="mode-sentence" role="tab" aria-selected="false">예문 시험</button>'
    ].join('');
    main.insertBefore(switcher, listen);

    const test = document.createElement('section');
    test.id = 'typing-test';
    test.hidden = true;
    test.innerHTML = [
      '<h2 id="test-title">단어 시험</h2>',
      '<p class="test-help" id="test-help"></p>',
      '<div id="test-setup">',
      '<p class="range-note">번호는 이 단어장에 나온 순서입니다. 1쪽의 첫 단어가 1번이고, 다음 쪽으로 이어집니다. 인쇄물에서는 쪽마다 순서가 다시 1부터 시작합니다.</p>',
      '<div class="range-row">',
      '<label>시작 번호<input id="range-start" inputmode="numeric" type="number" min="1" step="1"></label>',
      '<label>끝 번호<input id="range-end" inputmode="numeric" type="number" min="1" step="1"></label>',
      '</div>',
      '<p class="range-preview" id="range-preview"></p>',
      '<p id="test-message" role="status"></p>',
      '<div class="test-actions"><button type="button" id="test-start" class="primary-btn">시험 시작</button></div>',
      '</div>',
      '<div id="test-run" hidden>',
      '<p class="last-mark" id="last-mark" role="status"></p>',
      '<div class="question-card">',
      '<p class="q-progress" id="q-progress"></p>',
      '<p class="q-meta" id="q-meta"></p>',
      '<p class="prompt" id="q-prompt"></p>',
      '<label for="answer" id="answer-label">답 입력</label>',
      '<input id="answer" type="text" lang="zh-CN" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next">',
      '<p class="tally" id="tally"></p>',
      '<p class="enter-note">Enter 키로 확인하고 다음 문제로 넘어갑니다. 중국어 입력 중(글자가 조합되는 동안)에는 넘어가지 않습니다.</p>',
      '<div class="test-actions">',
      '<button type="button" id="test-submit" class="primary-btn">확인</button>',
      '<button type="button" id="test-finish" class="secondary">여기까지 하고 결과 보기</button>',
      '</div>',
      '</div>',
      '</div>',
      '<div id="test-result" hidden>',
      '<div class="score-block">',
      '<p class="score-fraction" id="score-fraction"></p>',
      '<p class="score-hundred" id="score-hundred"></p>',
      '</div>',
      '<ol class="result-list" id="result-list"></ol>',
      '<div class="test-actions">',
      '<button type="button" id="test-retry" class="primary-btn">같은 범위로 다시 하기</button>',
      '<button type="button" id="test-back" class="secondary">범위 다시 고르기</button>',
      '</div>',
      '</div>'
    ].join('');
    main.insertBefore(test, listen);

    const ui = {
      modeListen: document.getElementById('mode-listen'),
      modeWord: document.getElementById('mode-word'),
      modeSentence: document.getElementById('mode-sentence'),
      setup: document.getElementById('test-setup'),
      run: document.getElementById('test-run'),
      result: document.getElementById('test-result'),
      title: document.getElementById('test-title'),
      help: document.getElementById('test-help'),
      startInput: document.getElementById('range-start'),
      endInput: document.getElementById('range-end'),
      preview: document.getElementById('range-preview'),
      message: document.getElementById('test-message'),
      startBtn: document.getElementById('test-start'),
      progress: document.getElementById('q-progress'),
      meta: document.getElementById('q-meta'),
      prompt: document.getElementById('q-prompt'),
      answerLabel: document.getElementById('answer-label'),
      answer: document.getElementById('answer'),
      tally: document.getElementById('tally'),
      lastMark: document.getElementById('last-mark'),
      submit: document.getElementById('test-submit'),
      finish: document.getElementById('test-finish'),
      fraction: document.getElementById('score-fraction'),
      hundred: document.getElementById('score-hundred'),
      resultList: document.getElementById('result-list'),
      retry: document.getElementById('test-retry'),
      back: document.getElementById('test-back')
    };

    const state = {
      mode: 'listen',
      kind: 'word',
      queue: [],
      index: 0,
      answers: [],
      phase: 'setup',
      correctCount: 0,
      composing: false,
      blockEnterUntil: 0,
      lockUntil: 0
    };

    ui.startInput.max = String(total);
    ui.endInput.max = String(total);
    ui.startInput.value = '1';
    ui.endInput.value = String(Math.min(20, total));

    function pageBounds() {
      const page = Number(document.getElementById('page').value);
      const onPage = items.filter(function (item) { return item.page === page; });
      if (!onPage.length) return null;
      return { start: onPage[0].bookNo, end: onPage[onPage.length - 1].bookNo };
    }

    function setMode(mode) {
      const fromListen = state.mode === 'listen' && mode !== 'listen';
      state.mode = mode;
      const testing = mode !== 'listen';
      ui.modeListen.setAttribute('aria-selected', String(!testing));
      ui.modeWord.setAttribute('aria-selected', String(mode === 'word'));
      ui.modeSentence.setAttribute('aria-selected', String(mode === 'sentence'));
      listen.hidden = testing;
      test.hidden = !testing;
      const audio = document.getElementById('audio');
      if (testing && audio) audio.pause();
      if (!testing) return;
      state.kind = mode;
      if (fromListen) {
        const bounds = pageBounds();
        if (bounds) {
          ui.startInput.value = String(bounds.start);
          ui.endInput.value = String(bounds.end);
        }
      }
      showSetup();
    }

    function showSetup() {
      state.phase = 'setup';
      ui.setup.hidden = false;
      ui.run.hidden = true;
      ui.result.hidden = true;
      ui.title.textContent = state.kind === 'word' ? '단어 시험' : '예문 시험';
      ui.help.textContent = state.kind === 'word'
        ? '한국어 뜻만 보고, 해당하는 중국어 단어를 한자로 입력합니다.'
        : '예문의 한국어 번역을 보고, 중국어 문장을 입력합니다. 띄어쓰기는 보지 않고, 전각과 반각 문장부호는 같게 봅니다. 맨 끝 문장부호는 빼도 맞습니다.';
      refreshRange();
    }

    function readBound(input) {
      const value = Number(input.value);
      if (!Number.isInteger(value)) return null;
      return value;
    }

    function selectedRange() {
      const start = readBound(ui.startInput);
      const end = readBound(ui.endInput);
      if (start === null || end === null || start < 1 || end > total || start > end) return null;
      return items.slice(start - 1, end);
    }

    function refreshRange() {
      const range = selectedRange();
      if (!range) {
        ui.preview.textContent = '1번부터 ' + total + '번까지 고를 수 있습니다. 시작 번호는 끝 번호보다 클 수 없습니다.';
        ui.startBtn.disabled = true;
        ui.message.textContent = '';
        return;
      }
      const first = range[0];
      const last = range[range.length - 1];
      ui.preview.textContent = first.bookNo + '번 ' + displayWord(first) + ' (' + first.page + '쪽 ' + first.localNo + '번) – ' +
        last.bookNo + '번 ' + displayWord(last) + ' (' + last.page + '쪽 ' + last.localNo + '번) · ' + range.length + '문제';
      if (state.kind === 'sentence') {
        const missing = range.filter(function (item) { return !item.exampleKo; });
        if (missing.length) {
          ui.startBtn.disabled = true;
          ui.message.textContent = missing.length === range.length
            ? '예문 시험을 시작할 수 없습니다. 단어 데이터에 예문의 한국어 번역이 없습니다. 중국어 예문과 단어의 한국어 뜻은 들어 있습니다.'
            : '선택한 범위 가운데 ' + missing.length + '문제는 예문 한국어 번역이 없어 시험을 시작할 수 없습니다.';
          return;
        }
      }
      ui.startBtn.disabled = false;
      ui.message.textContent = '';
    }

    function begin() {
      const range = selectedRange();
      if (!range || ui.startBtn.disabled) {
        refreshRange();
        return;
      }
      state.queue = range;
      state.answers = range.map(function () { return null; });
      state.index = 0;
      state.correctCount = 0;
      state.phase = 'question';
      ui.setup.hidden = true;
      ui.result.hidden = true;
      ui.run.hidden = false;
      ui.lastMark.textContent = '';
      ui.lastMark.className = 'last-mark';
      showQuestion();
    }

    function showQuestion() {
      const item = state.queue[state.index];
      ui.progress.textContent = '문제 ' + (state.index + 1) + ' / ' + state.queue.length;
      ui.meta.textContent = item.bookNo + '번 · ' + item.page + '쪽 ' + item.localNo + '번';
      ui.prompt.textContent = state.kind === 'word' ? item.meaning : item.exampleKo;
      ui.answerLabel.textContent = state.kind === 'word' ? '한자' : '중국어 문장';
      ui.answer.placeholder = state.kind === 'word' ? '한자를 입력하세요' : '중국어 문장을 입력하세요';
      ui.answer.value = '';
      ui.tally.textContent = '맞힌 개수 ' + state.correctCount;
      ui.answer.focus();
    }

    function grade(item, raw) {
      const given = String(raw || '').trim();
      const ok = state.kind === 'word' ? wordMatches(item, given) : sentencesMatch(item.example, given);
      return {
        item: item,
        given: given,
        ok: ok,
        expected: state.kind === 'word' ? displayWord(item) : item.example
      };
    }

    function commit(raw, finishEarly) {
      const now = performance.now();
      if (now < state.lockUntil || state.phase !== 'question') return;
      state.lockUntil = now + 150;
      const current = state.index;
      const item = state.queue[current];
      const typed = String(raw || '').trim();
      if (!finishEarly || typed) {
        const graded = grade(item, raw);
        state.answers[current] = graded;
        if (graded.ok) state.correctCount += 1;
        if (!finishEarly) {
          ui.lastMark.textContent = graded.ok ? '직전 문제 정답' : '직전 문제 오답';
          ui.lastMark.className = 'last-mark ' + (graded.ok ? 'is-right' : 'is-wrong');
        }
      }
      if (!finishEarly && current + 1 < state.queue.length) {
        state.index = current + 1;
        showQuestion();
        return;
      }
      for (let i = 0; i < state.queue.length; i++) {
        if (!state.answers[i]) {
          state.answers[i] = {
            item: state.queue[i],
            given: '',
            ok: false,
            expected: state.kind === 'word' ? displayWord(state.queue[i]) : state.queue[i].example,
            skipped: true
          };
        }
      }
      showResults();
    }

    function showResults() {
      state.phase = 'result';
      ui.run.hidden = true;
      ui.result.hidden = false;
      const correct = state.answers.filter(function (row) { return row && row.ok; }).length;
      const totalCount = state.answers.length;
      ui.fraction.textContent = correct + '/' + totalCount;
      ui.hundred.textContent = '100점 만점에 ' + scoreOutOf100(correct, totalCount) + '점';
      ui.resultList.replaceChildren();
      state.answers.forEach(function (row) {
        const li = document.createElement('li');
        li.className = row.ok ? 'is-right' : 'is-wrong';
        const item = row.item;
        const head = document.createElement('div');
        head.className = 'result-key';
        head.textContent = (row.ok ? '정답' : '오답') + ' · ' + item.bookNo + '번 · ' + item.page + '쪽 ' + item.localNo + '번';
        const prompt = document.createElement('div');
        prompt.className = 'result-prompt';
        prompt.textContent = state.kind === 'word' ? item.meaning : item.exampleKo;
        li.append(head, prompt);
        const expected = document.createElement('div');
        expected.textContent = '정답: ' + row.expected;
        li.appendChild(expected);
        if (!row.ok) {
          const mine = document.createElement('div');
          mine.textContent = '내 답: ' + (row.given ? row.given : '(입력 없음)');
          li.appendChild(mine);
        }
        ui.resultList.appendChild(li);
      });
      ui.result.scrollIntoView({ block: 'start' });
    }

    ui.modeListen.addEventListener('click', function () { setMode('listen'); });
    ui.modeWord.addEventListener('click', function () { setMode('word'); });
    ui.modeSentence.addEventListener('click', function () { setMode('sentence'); });
    ui.startInput.addEventListener('input', refreshRange);
    ui.endInput.addEventListener('input', refreshRange);
    ui.startBtn.addEventListener('click', begin);
    ui.submit.addEventListener('click', function () { commit(ui.answer.value, false); });
    ui.finish.addEventListener('click', function () { commit(ui.answer.value, true); });
    ui.retry.addEventListener('click', begin);
    ui.back.addEventListener('click', showSetup);

    ui.answer.addEventListener('compositionstart', function () { state.composing = true; });
    ui.answer.addEventListener('compositionend', function () {
      state.composing = false;
      state.blockEnterUntil = performance.now() + 100;
    });
    ui.answer.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      if (event.isComposing || state.composing || event.keyCode === 229) return;
      event.preventDefault();
    });
    ui.answer.addEventListener('keyup', function (event) {
      if (!shouldSubmitOnEnter(event, {
        composing: state.composing,
        blockEnterUntil: state.blockEnterUntil,
        now: performance.now()
      })) return;
      event.preventDefault();
      commit(ui.answer.value, false);
    });
  }

  return {
    flatten: flatten,
    normalizeSentence: normalizeSentence,
    sentencesMatch: sentencesMatch,
    wordForms: wordForms,
    wordMatches: wordMatches,
    displayWord: displayWord,
    shouldSubmitOnEnter: shouldSubmitOnEnter,
    scoreOutOf100: scoreOutOf100,
    exampleKorean: exampleKorean,
    mount: mount
  };
});
