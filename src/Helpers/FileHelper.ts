const bytesToSize = (bytes: number) => {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  if (bytes === 0) return "n/a";

  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString(), 10);

  if (i === 0) return `${bytes} ${sizes[i]}`;

  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

const getFileSizeFromURL = async (url: string) => {
  const req = await fetch(url, { method: 'HEAD' })

  return req.headers.get('content-length')
}

class JSONDecoderClass implements Transformer {
  constructor(private partialChunk: string = "") { }

  async transform(chunk: string, controller: { enqueue: (arg0: string) => void; }) {
    let normalisedData = this.partialChunk + chunk;

    normalisedData = normalisedData.replace(/[\n\s\\]/g, '');

    let chunks: string[] = []
    if (normalisedData.split(':[').length > 1) {
      chunks = normalisedData.split(':[')[1].split('},{')
    } else {
      const substrValue = 0

      if (normalisedData.startsWith('[{')) normalisedData = normalisedData.substring(2)

      chunks = normalisedData.substring(substrValue).split('},{')
    }

    [this.partialChunk = ""] = chunks.splice(-1);

    chunks.forEach(chunk => {
      let startsWithChar = ""

      if (!chunk.startsWith("{")) startsWithChar = "{"

      const item = startsWithChar + chunk + "}" + ","

      controller.enqueue(item)
    });
  }
}

class CSVDecoderClass implements Transformer {
  private partialChunk: string;

  constructor() {
    this.partialChunk = "";
  }

  async transform(chunk: string, controller: { enqueue: (arg0: string) => void; }) {
    let data = this.partialChunk + chunk;

    const chunks: string[] = [];
    const lines = data.split(/\r?\n/);

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];

      data += line;

      if (this.isCompleteRecord(data)) {
        chunks.push(data);

        data = "";
      } else {
        data += "\n";
      }
    }

    this.partialChunk = data;

    for (const chunk of chunks) {
      controller.enqueue(chunk);
    }
  }

  private isCompleteRecord(data: string): boolean {
    const quoteCount = (data.match(/"/g) || []).length;

    return quoteCount % 2 === 0;
  }
}

export { bytesToSize, getFileSizeFromURL, JSONDecoderClass, CSVDecoderClass }
