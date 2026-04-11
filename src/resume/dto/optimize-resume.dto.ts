import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OptimizeResumeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  jobDescription!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  immutableData!: string;
}
