const tasks = [
  { id: 1, supabaseId: 'UUID-1', title: 'test' },
  { id: 2, supabaseId: undefined, title: 'test' }
];

const allData = [
  { id: 'UUID-1', title: 'test' },
  { id: 'UUID-2', title: 'test' }
];

allData.forEach(row => {
  const task = tasks.find(t => t.supabaseId === row.id ||
    (!t.supabaseId && t.title === row.title));
  if (task) task.supabaseId = row.id;
});

console.log(tasks);
