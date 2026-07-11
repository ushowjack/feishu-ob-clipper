export function fakeVault(initialFiles = {}) {
  const files = new Map(Object.entries(initialFiles));

  class FakeFileHandle {
    constructor(path) {
      this.kind = "file";
      this.name = path.split("/").at(-1);
      this.path = path;
    }

    async createWritable() {
      let pending = "";
      return {
        write: async (value) => {
          pending = value instanceof Blob ? await value.text() : String(value);
        },
        close: async () => {
          files.set(this.path, pending);
        },
      };
    }
  }

  class FakeDirectoryHandle {
    constructor(path = "") {
      this.kind = "directory";
      this.name = path.split("/").at(-1) || "vault";
      this.path = path;
    }

    async queryPermission() {
      return "granted";
    }

    async requestPermission() {
      return "granted";
    }

    async getDirectoryHandle(name, { create = false } = {}) {
      if (!create) throw new DOMException("目录不存在", "NotFoundError");
      return new FakeDirectoryHandle(join(this.path, name));
    }

    async getFileHandle(name, { create = false } = {}) {
      const path = join(this.path, name);
      if (!create && !files.has(path)) throw new DOMException("文件不存在", "NotFoundError");
      return new FakeFileHandle(path);
    }
  }

  return {
    root: new FakeDirectoryHandle(),
    read(path) {
      return files.get(path);
    },
    has(path) {
      return files.has(path);
    },
  };
}

function join(directory, name) {
  return directory ? `${directory}/${name}` : name;
}
