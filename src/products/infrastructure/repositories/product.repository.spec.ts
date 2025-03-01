import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductRepository } from './product.repository';
import { Product } from '../../domain/entities/product.entity';
import { Repository } from 'typeorm';
import { GetProductsDto } from '@presentation/dtos/get-products.dto';

describe('ProductRepository', () => {
  let repository: ProductRepository;
  let productRepo: Repository<Product>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductRepository,
        {
          provide: getRepositoryToken(Product),
          useClass: Repository,
        },
      ],
    }).compile();

    repository = module.get<ProductRepository>(ProductRepository);
    productRepo = module.get<Repository<Product>>(getRepositoryToken(Product));
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('saveProducts', () => {
    it('should save products', async () => {
      const products: Product[] = [
        {
          id: 1,
          name: 'Product 1',
          price: 100,
          expiration: new Date().toDateString(),
          exchangeRates: {},
        },
        {
          id: 2,
          name: 'Product 2',
          price: 200,
          expiration: new Date().toDateString(),
          exchangeRates: {},
        },
      ];
      jest.spyOn(productRepo, 'query').mockResolvedValue(undefined);

      await repository.saveProducts(products);

      expect(productRepo.query).toHaveBeenCalledWith(
        'INSERT INTO product (name, price, expiration, "exchangeRates") VALUES ($1, $2, $3, $4),($5, $6, $7, $8)',
        expect.arrayContaining([
          'Product 1',
          100,
          expect.any(String),
          '{}',
          'Product 2',
          200,
          expect.any(String),
          '{}',
        ]),
      );
    });
  });

  describe('getProducts', () => {
    it('should return paginated products', async () => {
      const dto: GetProductsDto = { name: 'Product', limit: 2, page: 1 };
      const products: Product[] = [
        {
          id: 1,
          name: 'Product 1',
          price: 100,
          expiration: new Date().toDateString(),
          exchangeRates: {},
        },
        {
          id: 2,
          name: 'Product 2',
          price: 200,
          expiration: new Date().toDateString(),
          exchangeRates: {},
        },
      ];
      jest.spyOn(productRepo, 'createQueryBuilder').mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(products),
        getCount: jest.fn().mockResolvedValue(2),
        clone: jest.fn().mockReturnThis(),
      } as any);

      const result = await repository.getProducts(dto);

      expect(result).toEqual({
        data: products,
        total: 2,
        page: 1,
        limit: 2,
        totalPages: 1,
      });
    });

    it('should filter products by name', async () => {
      const dto: GetProductsDto = { name: 'Product 1' };
      const products: Product[] = [
        {
          id: 1,
          name: 'Product 1',
          price: 100,
          expiration: new Date().toDateString(),
          exchangeRates: {},
        },
      ];
      jest.spyOn(productRepo, 'createQueryBuilder').mockReturnValue({
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(products),
        getCount: jest.fn().mockResolvedValue(1),
        clone: jest.fn().mockReturnThis(),
      } as any);

      const result = await repository.getProducts(dto);

      expect(result.data).toEqual(products);
      expect(result.total).toBe(1);
    });
  });
});
