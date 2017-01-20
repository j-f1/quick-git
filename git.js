const { spawn } = require('child_process')

function streamToString (stream) {
  // FROM http://stackoverflow.com/a/32565479/5244995
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => {
      chunks.push(chunk.toString())
    })
    stream.on('end', () => {
      resolve(chunks.join(''))
    })
    stream.on('error', reject)
  })
}

const special = {}
const git = exports = module.exports = new Proxy((...args) => {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args)
    const stdout = streamToString(proc.stdout)
    const stderr = streamToString(proc.stderr)
    proc.on('exit', (code, signal) => {
      if (code || signal) {
        stderr.then(err => {
          const e = new Error(err)
          e.code = code
          e.signal = signal
          reject(e)
        })
      } else {
        stdout.then(resolve)
      }
    })
  })
}, {
  get (git, key) {
    if (git[key]) return git[key]
    if (special[key]) return special[key]
    return (...args) => git(require('lodash.kebabcase')(key), ...args)
  }
})
special.ready = () => git.status().then(stdout => stdout.trim().endsWith('nothing to commit, working directory clean'))

special.createOrSwitch = branch => {
  // From https://gist.github.com/marcuswestin/b44af9f71f85365959b2
  return new Promise((resolve, reject) => {
    git('show-branch', branch)
      .then(() => git.checkout(branch))
      .catch(() => git.checkout('-b', branch))
      .then(resolve, reject)
  })
}

special.run = (...commands) => {
  // run git with each set of arguments. For example: git.run(['tag', '-a', 'magic'], ['commit', '-m', 'Hello, world!'])
  if (!commands[0]) return
  return git(...commands.shift()).then(() => git.run(...commands))
}

special.branches = () => git.branch('--list')
                          .then(raw => raw.split('\n'))
                          .then(lines => lines.map(line => ({name: line.slice(2), current: line.startsWith('*')})))
                          .then(lines => lines.map((line) => {
                            line.name = line.name.startsWith('(HEAD detached at') ? null : line.name
                            return line
                          }))
