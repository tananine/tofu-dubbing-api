import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

interface UploadFileInput {
  buffer: Buffer;
  key: string;
}

interface UploadedFile {
  key: string;
  url: string;
}

@Injectable()
export class StorageService {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly cdnUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('DO_SPACES_ENDPOINT');
    const region = this.configService.get<string>('DO_SPACES_REGION');
    const accessKeyId = this.configService.get<string>('DO_SPACES_KEY');
    const secretAccessKey = this.configService.get<string>('DO_SPACES_SECRET');

    this.bucketName = this.configService.get<string>('DO_SPACES_BUCKET')!;
    this.cdnUrl = this.configService.get<string>('DO_SPACES_CDN_URL')!;

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }

  getCdnUrl(key: string): string {
    return `${this.cdnUrl}/${key}`;
  }

  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async uploadBuffer(buffer: Buffer, key: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ACL: 'public-read',
      ContentType: 'audio/mpeg',
    });

    await this.s3Client.send(command);

    return this.getCdnUrl(key);
  }

  async uploadBuffers(files: UploadFileInput[]): Promise<UploadedFile[]> {
    const uploadPromises = files.map(async ({ buffer, key }) => {
      const url = await this.uploadBuffer(buffer, key);
      return { key, url };
    });

    return Promise.all(uploadPromises);
  }
}
