const fs = require('fs');
const path = require('path');

const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
const LOCAL_RECORDINGS_DIR = path.join(__dirname, '../../public/recordings');

// Ensure local directory exists
if (!fs.existsSync(LOCAL_RECORDINGS_DIR)) {
  fs.mkdirSync(LOCAL_RECORDINGS_DIR, { recursive: true });
}

let s3Client = null;
let PutObjectCommand = null;
let DeleteObjectCommand = null;
let GetObjectCommand = null;

if (STORAGE_PROVIDER === 's3') {
  try {
    const s3Sdk = require('@aws-sdk/client-s3');
    s3Client = new s3Sdk.S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
    PutObjectCommand = s3Sdk.PutObjectCommand;
    DeleteObjectCommand = s3Sdk.DeleteObjectCommand;
    GetObjectCommand = s3Sdk.GetObjectCommand;
  } catch (err) {
    console.warn('[STORAGE] @aws-sdk/client-s3 is not installed. Run `npm install @aws-sdk/client-s3` to enable R2/S3 storage.');
  }
}

/**
 * Save file from temp path to target destination (local or S3/R2)
 */
async function saveFile(tempFilePath, targetFilename) {
  if (STORAGE_PROVIDER === 'local' || !s3Client) {
    const destPath = path.join(LOCAL_RECORDINGS_DIR, targetFilename);
    await fs.promises.rename(tempFilePath, destPath);
    return `/recordings/${targetFilename}`;
  }

  // Upload to S3/R2
  const fileStream = fs.createReadStream(tempFilePath);
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `recordings/${targetFilename}`,
    Body: fileStream,
    ContentType: 'video/mp4',
  });
  await s3Client.send(command);
  
  // Clean up temp file
  try {
    await fs.promises.unlink(tempFilePath);
  } catch (e) {
    console.error('[STORAGE] Error unlinking temp file:', e);
  }

  // Return public URL proxied through the backend server to hide MinIO/S3 IP
  return `/api/livekit/recordings/${targetFilename}`;
}

/**
 * Delete a file (local or S3/R2)
 */
async function deleteFile(targetFilename) {
  if (STORAGE_PROVIDER === 'local' || !s3Client) {
    const destPath = path.join(LOCAL_RECORDINGS_DIR, targetFilename);
    if (fs.existsSync(destPath)) {
      await fs.promises.unlink(destPath);
    }
    return;
  }

  // Delete from S3/R2
  const command = new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `recordings/${targetFilename}`,
  });
  await s3Client.send(command);
}

/**
 * Get public URL for a file
 */
function getUrl(targetFilename) {
  if (STORAGE_PROVIDER === 'local') {
    return `/recordings/${targetFilename}`;
  }
  return `/api/livekit/recordings/${targetFilename}`;
}

/**
 * Download a file from S3/R2 to local path
 */
async function downloadFile(targetFilename, localDestPath) {
  if (STORAGE_PROVIDER === 'local' || !s3Client) {
    const srcPath = path.join(LOCAL_RECORDINGS_DIR, targetFilename);
    await fs.promises.copyFile(srcPath, localDestPath);
    return;
  }

  // Download from S3/R2
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `recordings/${targetFilename}`,
  });
  const response = await s3Client.send(command);
  
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(localDestPath);
    response.Body.pipe(fileStream)
      .on('error', reject)
      .on('finish', resolve);
  });
}

/**
 * Get a readable stream for a file (local or S3/R2)
 */
async function getStream(targetFilename, rangeOpts = {}) {
  const { start, end } = rangeOpts;

  if (STORAGE_PROVIDER === 'local' || !s3Client) {
    const filePath = path.join(LOCAL_RECORDINGS_DIR, targetFilename);
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found locally');
    }
    const readStreamOptions = {};
    if (typeof start === 'number') readStreamOptions.start = start;
    if (typeof end === 'number') readStreamOptions.end = end;
    
    return fs.createReadStream(filePath, readStreamOptions);
  }

  // Stream from S3/R2 with Range
  const s3Params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `recordings/${targetFilename}`,
  };

  if (typeof start === 'number') {
    s3Params.Range = `bytes=${start}-${typeof end === 'number' ? end : ''}`;
  }

  const command = new GetObjectCommand(s3Params);
  const response = await s3Client.send(command);
  return response.Body;
}

module.exports = {
  saveFile,
  deleteFile,
  downloadFile,
  getStream,
  getUrl,
  LOCAL_RECORDINGS_DIR
};
