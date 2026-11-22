export const gradeTypeLabels = {
  homework: 'Домашние задания',
  test: 'Контрольные',
  practice: 'Практические работы',
  project: 'Проекты',
  session: 'Сессия',
  other: 'Другие активности'
};

export const gradeTypeFilter = (value) => Object.hasOwn(gradeTypeLabels, value) ? value : 'all';

export function activityType(title, kind) {
  if (Object.hasOwn(gradeTypeLabels, kind)) return kind;
  if (/контрольн|тест/i.test(title)) return 'test';
  if (/домашн/i.test(title)) return 'homework';
  if (/проект/i.test(title)) return 'project';
  if (/практик|лаборатор|семинар/i.test(title)) return 'practice';
  return 'other';
}

export function gradeFilterOptions(path, types) {
  return [['all', 'Все активности', path], ...Object.entries(gradeTypeLabels)
    .filter(([id]) => types.has(id)).map(([id, label]) => [id, label, path + '?type=' + id])];
}
