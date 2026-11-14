import { DatabaseSync } from 'node:sqlite'

export interface Project {
  id: string
  name: string
  description?: string
}

export interface TestCase {
  id: string
  projectId: string
  title: string
  steps: string[]
  expectedResult: string
}

export interface TestExecution {
  id: string
  testCaseId: string
  status: 'PASS' | 'FAIL' | 'BLOCKED'
  notes?: string
  executedAt: string
}

export function createStorage(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS projects (
      creation_order INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT
    );
    CREATE TABLE IF NOT EXISTS test_cases (
      creation_order INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      steps TEXT NOT NULL,
      expected_result TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_executions (
      creation_order INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      test_case_id TEXT NOT NULL REFERENCES test_cases(id),
      status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL', 'BLOCKED')),
      notes TEXT,
      executed_at TEXT NOT NULL
    );
  `)

  return {
    listProjects(): Project[] {
      return db.prepare('SELECT id, name, description FROM projects ORDER BY creation_order').all()
        .map(row => ({ id: row.id as string, name: row.name as string,
          ...(row.description === null ? {} : { description: row.description as string }) }))
    },
    hasProject(id: string): boolean {
      return db.prepare('SELECT 1 FROM projects WHERE id = ?').get(id) !== undefined
    },
    addProject(project: Project) {
      db.prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)')
        .run(project.id, project.name, project.description ?? null)
    },
    listTestCases(projectId: string): TestCase[] {
      return db.prepare(`SELECT id, project_id, title, steps, expected_result FROM test_cases
        WHERE project_id = ? ORDER BY creation_order`).all(projectId)
        .map(row => ({ id: row.id as string, projectId: row.project_id as string,
          title: row.title as string, steps: JSON.parse(row.steps as string) as string[],
          expectedResult: row.expected_result as string }))
    },
    hasTestCase(id: string): boolean {
      return db.prepare('SELECT 1 FROM test_cases WHERE id = ?').get(id) !== undefined
    },
    addTestCase(testCase: TestCase) {
      db.prepare(`INSERT INTO test_cases (id, project_id, title, steps, expected_result)
        VALUES (?, ?, ?, ?, ?)`).run(testCase.id, testCase.projectId, testCase.title,
        JSON.stringify(testCase.steps), testCase.expectedResult)
    },
    listExecutions(testCaseId: string): TestExecution[] {
      return db.prepare(`SELECT id, test_case_id, status, notes, executed_at FROM test_executions
        WHERE test_case_id = ? ORDER BY creation_order`).all(testCaseId)
        .map(row => ({ id: row.id as string, testCaseId: row.test_case_id as string,
          status: row.status as TestExecution['status'], executedAt: row.executed_at as string,
          ...(row.notes === null ? {} : { notes: row.notes as string }) }))
    },
    addExecution(execution: TestExecution) {
      db.prepare(`INSERT INTO test_executions (id, test_case_id, status, notes, executed_at)
        VALUES (?, ?, ?, ?, ?)`).run(execution.id, execution.testCaseId, execution.status,
        execution.notes ?? null, execution.executedAt)
    }
  }
}
