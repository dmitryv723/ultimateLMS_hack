import { addDays, fullDate, validDate } from './fixtures.js';
import { backLink, escape, icon, intro, linkButton } from './layout.js';
import { markdownContent } from './markdown.js';
import { formatToolbar } from './format-toolbar.js';
import { hasAttachment, publicationFileLimit, readAttachment } from './publication.js';
import { newSubmissionKey, validSubmissionKey } from './services.js';

const eventsPath = '/events';
const staffEventsPath = '/staff/events';
const eventPath = (id) => eventsPath + '/' + id;
const detail = (event) => fullDate(event.day) + ' · ' + event.start + '–' + event.end + ' МСК';
const eventClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', second: '2-digit'
});
export const eventNow = (date) => date + 'T' + eventClock.format(new Date()).slice(0, 5);
export const eventStarted = (event, now) => event.day + 'T' + event.start <= now;
const csrfField = (value) => `<input type="hidden" name="csrf" value="${escape(value)}">`;
const eventError = (error) => error ? `<p class="form-error" role="alert">${escape(error)}</p>` : '';

const imagePath = (id) => '/event-images/' + id;
const imageFormats = ['image/jpeg', 'image/png'];
const imageAccept = imageFormats.join(',');
const maxEventPhotos = 6;
const eventCover = (event) => event?.cover_id
  ? `<img class="event-cover" src="${imagePath(event.cover_id)}" alt="" loading="lazy">` : '';

function eventDescription(event) {
  const photos = event.photos ?? [];
  const embedded = new Set();
  const resolveImage = (url) => {
    const number = Number(/^photo:([1-6])$/.exec(url)?.[1]);
    const photo = photos[number - 1];
    if (!photo) return '';
    embedded.add(photo.id);
    return imagePath(photo.id);
  };
  const description = markdownContent(event.description, { resolveImage });
  const gallery = photos.filter(({ id }) => !embedded.has(id));
  return description + (gallery.length ? `<div class="event-gallery">${gallery.map(({ id, filename }) =>
    `<img src="${imagePath(id)}" alt="${escape(filename)}" loading="lazy">`).join('')}</div>` : '');
}

function eventCards(events, staff) {
  if (!events.length) return '<p class="panel grade-empty">Пока нет событий.</p>';
  return `<div class="event-list">${events.map((event) => `<a class="panel event-card" href="${staff ? staffEventsPath + '/' + event.id : eventPath(event.id)}">
    ${eventCover(event)}
    <div class="event-card-content">
    <h2>${escape(event.title)}</h2>
    <span class="event-card-date">${icon('calendar')}${escape(detail(event))}</span>
    <p>${escape(event.place)}</p>
    ${staff ? `<small>Записались: ${event.attendees}</small>` : event.registered || event.saved
      ? `<small>${[event.registered && 'Вы записаны', event.saved && 'В расписании'].filter(Boolean).join(' · ')}</small>` : ''}
    </div>
  </a>`).join('')}</div>`;
}

export function eventList(events, staff = false) {
  return `<div class="event-screen">${intro('Афиша')}
    <div class="event-actions">${staff ? linkButton(staffEventsPath + '/new', 'Создать событие', 'plus')
      : `<a class="button-secondary" href="/schedule">${icon('calendar')}Моё расписание</a>`}</div>
    ${eventCards(events, staff)}</div>`;
}

export function learnerEvent(event, now, csrf, error) {
  const action = eventPath(event.id);
  const post = (name, label) => `<form method="post" action="${action}">${csrfField(csrf)}
    <button class="button-secondary" type="submit" name="action" value="${name}">${label}</button></form>`;
  return `<div class="detail">${backLink(eventsPath, 'К афише')}${intro(event.title, detail(event))}
    <section class="panel detail-panel event-detail">
      ${eventCover(event)}
      <p><strong>Место</strong> · ${escape(event.place)}</p>
      ${eventDescription(event)}
      ${event.registered ? '<p class="event-confirmation">Вы записаны на событие</p>' : ''}
      ${event.saved ? `<p class="event-confirmation"><a class="text-link" href="/schedule/week?date=${event.day}">Событие в моём расписании</a></p>` : ''}
      ${eventError(error)}
      <div class="event-actions">
        ${eventStarted(event, now) ? '<span class="muted">Регистрация закрыта</span>' : event.registered
          ? post('unregister', 'Отменить регистрацию') : post('register', 'Зарегистрироваться')}
        ${event.saved ? post('remove', 'Убрать из расписания') : post('save', 'Добавить в расписание')}
        <a class="button-secondary" href="${action}/calendar.ics">${icon('download')}Скачать .ics</a>
      </div>
    </section>
  </div>`;
}

function eventForm(path, csrf, values, event, error) {
  const label = (name, caption, type, extra = '') =>
    `<label>${caption}<input type="${type}" name="${name}" value="${escape(values[name] || '')}" ${extra} required></label>`;
  return `<form class="panel detail-panel staff-form" method="post" action="${path}" enctype="multipart/form-data">
    ${csrfField(csrf)}
    <input type="hidden" name="submission" value="${validSubmissionKey(values.key) ? values.key : newSubmissionKey()}">
    ${event ? `<input type="hidden" name="revision" value="${event.revision}">` : ''}
    ${eventError(error)}
    ${label('title', 'Название', 'text', 'maxlength="120"')}
    ${label('place', 'Место', 'text', 'maxlength="120"')}
    <div class="event-time-fields">
      ${label('day', 'Дата', 'date', 'max="2099-12-31"')}
      ${label('start', 'Начало (МСК)', 'time')}
      ${label('end', 'Окончание (МСК)', 'time')}
    </div>
    <label>Обложка афиши<input type="file" name="cover" accept="${imageAccept}"><small>JPG или PNG. Показывается над названием в афише.</small></label>
    ${eventCover(event)}
    <label>Описание${formatToolbar('event-description')}<textarea id="event-description" name="description" rows="5" maxlength="2000" required>${escape(values.description || '')}</textarea></label>
    <label>Фотографии к описанию<input type="file" name="photos" accept="${imageAccept}" multiple>
      <small>До ${maxEventPhotos} фотографий. Лимит одной загрузки вместе с обложкой — 10 МБ. Чтобы поставить первое фото в нужное место текста, используйте <code>![Подпись](photo:1)</code>.</small>
    </label>
    ${event?.photos?.length ? `<ol class="event-photo-references">${event.photos.map(({ filename }, index) =>
      `<li><code>photo:${index + 1}</code> · ${escape(filename)}</li>`).join('')}</ol>` : ''}
    <button type="submit" class="button">${event ? 'Сохранить изменения' : 'Создать событие'}</button>
  </form>`;
}

function readEvent(form, now, current) {
  const value = (key) => {
    const raw = form.get(key);
    return typeof raw === 'string' ? raw.trim() : '';
  };
  const fields = Object.fromEntries(['title', 'description', 'place', 'day', 'start', 'end'].map((key) => [key, value(key)]));
  const key = value('submission');
  const { title, description, place, day, start, end } = fields;
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  let error = '';
  const invalidText = [title, place, description].some((text) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text));
  if (invalidText || !title || title.length > 120 || !place || place.length > 120 ||
      !description || description.length > 2000 || !validSubmissionKey(key)) {
    error = 'Укажите название, место и описание события.';
  } else if (!validDate(day) || day > '2099-12-31' || !time.test(start) || !time.test(end) || start >= end) {
    error = 'Укажите дату и время. Окончание должно быть позже начала в тот же день.';
  } else if (eventStarted(fields, now) && (!current || day !== current.day || start !== current.start || end !== current.end)) {
    error = 'Укажите дату и время в будущем.';
  }
  return { fields, key, error };
}

async function readEventImages(form, current) {
  const cover = form.get('cover');
  const photos = (typeof form.getAll === 'function' ? form.getAll('photos') : []).filter(hasAttachment);
  const uploads = hasAttachment(cover) ? [cover, ...photos] : photos;
  if (photos.length + (current?.photos?.length ?? 0) > maxEventPhotos) return { error: 'Можно прикрепить до 6 фотографий к описанию.' };
  if (uploads.reduce((size, file) => size + file.size, 0) > publicationFileLimit) {
    return { error: 'Размер загружаемых изображений вместе не должен превышать 10 МБ.' };
  }
  const files = await Promise.all(uploads.map(readAttachment));
  if (files.some((file) => file.error || !imageFormats.includes(file.mime))) {
    return { error: 'Загрузите изображения в формате JPG или PNG.' };
  }
  return hasAttachment(cover) ? { cover: files[0], photos: files.slice(1) } : { photos: files };
}

export async function officeEventRoute({ path, form, formError, csrf, store, person, date }) {
  if (path === staffEventsPath && !form) return { title: 'Афиша', body: eventList(store.eventsForOffice(), true) };
  const match = /^\/staff\/events\/(new|[a-z0-9-]+)$/.exec(path);
  if (!match) return null;
  const creating = match[1] === 'new';
  const event = creating ? null : store.eventForOffice(match[1]);
  if (!creating && !event) return null;
  const title = event?.title ?? 'Создать событие';
  const now = eventNow(date);
  const show = (fields, error, status = 200) => ({ title, status,
    body: `<div class="detail">${backLink(staffEventsPath, 'К афише')}${intro(title, event ? 'Зарегистрировались: ' + event.attendees : '')}
      ${eventForm(path, csrf, fields, event, error)}</div>` });
  const defaults = event ?? { day: addDays(date, 1), start: '18:00', end: '19:00' };
  if (formError) return show(defaults, formError.message, formError.status);
  if (!form) return show(defaults);
  const { fields, key, error } = readEvent(form, now, event);
  if (error) return show({ ...fields, key }, error, 422);
  const images = await readEventImages(form, event);
  if (images.error) return show({ ...fields, key }, images.error, 422);
  if (creating) return { redirect: staffEventsPath + '/' + store.createEvent(person.id, fields, key, images) };
  const revision = form.get('revision') || '';
  if (!/^\d+$/.test(revision) || !store.updateEvent(event.id, fields, Number(revision), images)) {
    return show(event, 'Событие уже изменили. Проверьте актуальные данные и повторите правку.', 409);
  }
  return { redirect: path };
}

const calendarText = (value) => value.replaceAll('\\', '\\\\').replace(/\r\n?|\n/g, '\\n')
  .replaceAll(';', '\\;').replaceAll(',', '\\,');
const utcStamp = (date) => new Date(date).toISOString().replace(/[-:]|\.\d{3}/g, '');
function foldCalendarLine(line) {
  let width = 0;
  let result = '';
  const encoder = new TextEncoder();
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (width + bytes > 75) {
      result += '\r\n ';
      width = 1;
    }
    result += char;
    width += bytes;
  }
  return result;
}

export function eventCalendarFile(event) {
  const at = (time) => utcStamp(event.day + 'T' + time + ':00+03:00');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Digital Dean Office//Campus Events//RU', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', 'UID:' + event.id + '@digital-dean-office.example', 'DTSTAMP:' + utcStamp(event.updated_at),
    'SEQUENCE:' + event.revision, 'DTSTART:' + at(event.start), 'DTEND:' + at(event.end),
    'SUMMARY:' + calendarText(event.title), 'DESCRIPTION:' + calendarText(event.description),
    'LOCATION:' + calendarText(event.place), 'END:VEVENT', 'END:VCALENDAR', ''
  ].map(foldCalendarLine).join('\r\n');
}
