import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { PassThrough } from 'stream';

export interface StreamUpload {
  stream: PassThrough;
  done: Promise<string>;
  abort: () => Promise<void>;
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

  createStreamUpload(key: string): StreamUpload {
    const stream = new PassThrough();
    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucketName,
        Key: key,
        Body: stream,
        ACL: 'public-read',
        ContentType: 'audio/mpeg',
      },
    });

    const done = upload.done().then(() => this.getCdnUrl(key));

    return {
      stream,
      done,
      abort: () => upload.abort().catch(() => undefined),
    };
  }
}
