import { validDate } from './fixtures.js';
import { validSubmissionKey } from './services.js';

export const publicationFileLimit = 10 * 1024 * 1024;
const startsWithZip = (bytes) => bytes.subarray(0, 4).toString('hex') === '504b0304';
const isText = (bytes) => !bytes.includes(0);
const formats = {
  pdf: ['application/pdf', (bytes) => bytes.subarray(0, 5).toString('ascii') === '%PDF-'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', startsWithZip],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', startsWithZip],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', startsWithZip],
  txt: ['text/plain', isText],
  md: ['text/markdown', isText],
  csv: ['text/csv', isText],
  png: ['image/png', (bytes) => bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'],
  jpg: ['image/jpeg', (bytes) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff'],
  jpeg: ['image/jpeg', (bytes) => bytes.subarray(0, 3).toString('hex') === 'ffd8ff']
};
export const publicationAccept = Object.keys(formats).map((ext) => '.' + ext).join(',');
export const publicationKind = (kind) => ['material', 'homework', 'test'].includes(kind) ? kind : 'material';

export const hasAttachment = (file) => file instanceof File && Boolean(file.name || file.size);

export async function readAttachment(file) {
  if (!file.size || file.size > publicationFileLimit) return { error: 'Выберите непустой файл размером до 10 МБ.' };
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase();
  if (!Object.hasOwn(formats, extension) || file.name.length > 120 || /[\\/\u0000-\u001F\u007F]/.test(file.name)) {
    return { error: 'Формат файла не поддерживается. Выберите PDF, DOCX, PPTX, XLSX, TXT, MD, CSV, PNG или JPEG.' };
  }
  const contents = Buffer.from(await file.arrayBuffer());
  const [mime, matches] = formats[extension];
  if (!matches(contents)) return { error: 'Содержимое файла не соответствует его расширению.' };
  return { filename: file.name, mime, contents };
}

export async function readPublication(form, date, existing) {
  const field = (name) => {
    const value = form.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  const kind = existing?.kind ?? field('kind');
  const title = field('title');
  const description = field('description');
  const day = kind === 'material' ? null : field('day');
  const time = kind === 'material' ? null : field('time');
  const key = field('submission');
  const values = { kind: publicationKind(kind), title, description, day: day || date, time: time || '23:59' };
  const problem = (error) => ({ error, values });
  const file = form.get('attachment');
  if (!['material', 'homework', 'test'].includes(kind) || !title || title.length > 100 ||
      description.length > 2500 || !validSubmissionKey(key)) {
    return problem('Укажите название до 100 символов и описание до 2500 символов.');
  }
  if (kind !== 'material' && (!validDate(day) || (!existing && day < date) || day > '2099-12-31' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return problem('Проверьте дату и время задания или контрольной.');
  }
  if (!hasAttachment(file)) {
    if (kind === 'material' && !existing?.filename) return problem('Выберите файл материала.');
    if (kind !== 'material' && !description && !existing?.filename) return problem('Добавьте описание задания или прикрепите файл.');
    return { kind, title, description, day, time, key, ...(existing ? {} : { filename: '', mime: '', contents: Buffer.alloc(0) }) };
  }
  const attachment = await readAttachment(file);
  return attachment.error ? problem(attachment.error) : { kind, title, description, day, time, ...attachment, key };
}
