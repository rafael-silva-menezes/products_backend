import { ApiProperty } from '@nestjs/swagger';

export class CsvError {
  @ApiProperty({ description: 'Line number where the error occurred' })
  line: number;

  @ApiProperty({ description: 'Error message describing the issue' })
  error: string;
}
