import { markdownContent } from './markdown.js';
import { shortDate, validDate } from './fixtures.js';
import { backLink, escape, icon, intro } from './layout.js';
import { peopleById } from './people.js';
import { requestNumber, serviceTitle } from './services.js';

const studentPath = '/services/consultations';
const officePath = '/staff/consultations';
const clock = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' });
const appointmentNow = (date) => date + ' ' + clock.format(new Date());
const view = (body, status = 200) => ({ title: 'Консультации', body, status });
const follow = (target) => ({ redirect: target });
const hiddenCsrf = (csrf) => `<input type="hidden" name="csrf" value="${escape(csrf)}">`;
const alert = (error) => error ? `<p class="form-error" role="alert">${escape(error)}</p>` : '';
const when = ({ day, time }) => escape(shortDate(day) + ', ' + time + ' МСК');
const attendee = (id) => peopleById.get(id)?.fullName || 'Студент';

function learnerOverview(person, slots, requestId) {
  const mine = slots.filter(({ student_id }) => student_id === person.id);
  const available = slots.filter(({ student_id }) => !student_id);
  return `${backLink('/services', 'К справкам и обращениям')}${intro('Консультации')}
    <section class="panel staff-section"><h2>Мои записи</h2>
      ${mine.length ? `<ul class="staff-records">${mine.map((slot) =>
        `<li><a href="${studentPath}/${slot.id}"><strong>${when(slot)}</strong><small>${escape(slot.topic)}</small></a></li>`).join('')}</ul>`
        : '<p class="muted">У вас пока нет записей.</p>'}</section>
    <section class="panel staff-section"><h2>Свободные слоты</h2>
      ${available.length ? `<ul class="staff-records staff-topic-list">${available.map((slot) =>
        `<li><a href="${studentPath}/${slot.id}${requestId ? '?request=' + encodeURIComponent(requestId) : ''}">
          <span><strong>${when(slot)}</strong><small>${escape(slot.meeting_place)} · 30 минут</small></span>${icon('chevron')}</a></li>`).join('')}</ul>`
        : '<p class="muted">Учебный офис пока не добавил свободные слоты.</p>'}</section>`;
}

function learnerSlot(slot, requests, requestId, csrf, now, error, topic = '') {
  return `${backLink(studentPath, 'К консультациям')}${intro(slot.student_id ? 'Ваша консультация' : 'Запись на консультацию')}
    <section class="panel staff-section"><h2>${when(slot)}</h2>
      <p>${escape(slot.meeting_place)} · 30 минут</p>
      ${slot.student_id ? `${markdownContent(slot.topic)}
        ${slot.request_id ? `<a class="text-link" href="/services/requests/${escape(slot.request_id)}">Связанное обращение</a>` : ''}` : ''}
      ${alert(error)}
      ${slot.student_id && slot.day + ' ' + slot.time <= now ? '' : `<form class="staff-form" method="post" action="${studentPath}/${slot.id}">
        ${hiddenCsrf(csrf)}
        ${slot.student_id ? '<button class="button-secondary" name="action" value="cancel">Отменить запись</button>' : `
          <label>Тема встречи<textarea name="topic" maxlength="300" rows="3" required>${escape(topic)}</textarea></label>
          ${requests.length ? `<label>Связанное обращение<select name="request">
            <option value="">Без обращения</option>${requests.map(({ id, service }) =>
              `<option value="${escape(id)}"${id === requestId ? ' selected' : ''}>${escape(requestNumber(id) + ' · ' + serviceTitle(service))}</option>`).join('')}
          </select></label>` : ''}
          <button class="button" name="action" value="book">Записаться</button>`}
      </form>`}
    </section>`;
}

export function learnerConsultations({ person, store, date, csrf, path, query, form }) {
  const now = appointmentNow(date);
  const requests = store.requestsFor(person.id);
  const requested = form?.get('request') ?? query.get('request');
  const owned = requests.find(({ id }) => id === requested)?.id;
  if (path === studentPath && !form) return view(learnerOverview(person, store.consultationsForStudent(person.id, now), owned));
  const id = Number(/^\/services\/consultations\/(\d+)$/.exec(path)?.[1]);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const slot = store.consultationSlot(id, person.id, now);
  if (!slot) return form ? view(`${intro('Слот уже недоступен')}${backLink(studentPath, 'Выбрать другой слот')}`, 409) : null;
  if (!form) return view(learnerSlot(slot, requests, owned, csrf, now));
  if (slot.student_id && form.get('action') === 'cancel') {
    return store.cancelConsultation(person.id, id, now) ? follow(studentPath)
      : view(learnerSlot(slot, requests, owned, csrf, now, 'Отменить прошедшую консультацию нельзя.'), 409);
  }
  if (slot.student_id || form.get('action') !== 'book') return follow(studentPath + '/' + id);
  const topic = (form.get('topic') || '').trim();
  if (!topic || topic.length > 300 || (requested && !owned)) {
    return view(learnerSlot(slot, requests, owned, csrf, now, 'Укажите тему встречи и проверьте связанное обращение.', topic), 422);
  }
  return store.bookConsultation(person.id, id, topic, owned ?? null, now) ? follow(studentPath + '/' + id)
    : view(`${intro('Запись не сохранена', 'Слот заняли или у вас уже есть встреча на это время.')}${backLink(studentPath, 'К свободным слотам')}`, 409);
}

function officeConsultationView(slots, date, csrf, error, fields = {}) {
  return `${intro('Консультации')}
    <section class="panel staff-section"><h2>Добавить свободный слот</h2>
      ${alert(error)}<form class="staff-form" method="post" action="${officePath}">
        ${hiddenCsrf(csrf)}<div class="staff-fields">
          <label>Дата<input name="day" type="date" min="${date}" value="${escape(fields.day ?? date)}" required></label>
          <label>Начало (МСК)<input name="time" type="time" step="1800" value="${escape(fields.time ?? '12:00')}" required></label></div>
        <label>Кабинет или место встречи<input name="place" maxlength="100" value="${escape(fields.place ?? '')}" required></label>
        <button class="button" name="action" value="create">Открыть слот на 30 минут</button>
      </form></section>
    <section class="panel staff-section"><h2>Ближайшие слоты</h2>
      ${slots.length ? `<ul class="staff-records">${slots.map((slot) =>
        `<li><strong>${when(slot)}</strong><small>${escape(slot.meeting_place)} · ${slot.student_id ? escape(attendee(slot.student_id)) : 'Свободно'}</small>
          ${slot.student_id ? `${markdownContent(slot.topic)}
            ${slot.request_id ? `<a class="text-link" href="/staff/requests/${escape(slot.request_id)}">Открыть обращение</a>` : ''}` :
            `<form class="staff-signout" method="post" action="${officePath}">${hiddenCsrf(csrf)}
              <input type="hidden" name="slot" value="${slot.id}"><button class="button-secondary" name="action" value="withdraw">Закрыть слот</button></form>`}
        </li>`).join('')}</ul>` : '<p class="muted">Ближайших слотов пока нет.</p>'}
    </section>`;
}

export function officeConsultations({ person, store, date, csrf, form }) {
  const show = (error, status = 200, fields) => view(officeConsultationView(store.consultationsForOffice(person.id, date), date, csrf, error, fields), status);
  if (!form) return show();
  if (form.get('action') === 'withdraw') {
    const id = Number(form.get('slot'));
    if (!Number.isSafeInteger(id) || id < 1 || !store.withdrawConsultation(person.id, id)) {
      return show('Слот уже закрыт или на него записался студент.', 409);
    }
    return follow(officePath);
  }
  if (form.get('action') !== 'create') return show('Выберите действие для слота.', 422);
  const day = form.get('day') || '';
  const time = form.get('time') || '';
  const place = (form.get('place') || '').trim();
  const fields = { day, time, place };
  if (!validDate(day) || day > '2099-12-31' || !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(time) ||
      day + ' ' + time <= appointmentNow(date) || !place || place.length > 100) {
    return show('Выберите будущие дату и время с шагом 30 минут и укажите место встречи.', 422, fields);
  }
  return store.createConsultation(person.id, day, time, place) ? follow(officePath)
    : show('На это время уже открыт слот.', 409, fields);
}
