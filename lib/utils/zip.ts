import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface ZipFile {
  name: string;
  content: Blob | string;
}

export async function createZip(files: ZipFile[]): Promise<void> {
  const zip = new JSZip();
  
  files.forEach(file => {
    zip.file(file.name, file.content);
  });
  
  const content = await zip.generateAsync({ type: 'blob' });
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  saveAs(content, `downloads_${timestamp}.zip`);
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');
    
    const blob = await response.blob();
    saveAs(blob, filename);
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}
