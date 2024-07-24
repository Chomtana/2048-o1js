import { Board, Game2048 } from './game2048';
import {
  Field,
  Bool,
  PrivateKey,
  PublicKey,
  Mina,
  AccountUpdate,
  Signature,
} from 'o1js';

const TILE_L = [
  [2, [0, 0]],
  [2, [1, 0]],
  [2, [2, 0]],
  [2, [3, 0]],
  [2, [0, 1]],
  [2, [0, 2]],
  [2, [0, 3]],
]

const TESTCASES = [
  {
    name: 'Can create new tiles',
    commands: [
      ...TILE_L,
    ],
    result: [
      [1, 1, 1, 1],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ],
    ended: false,
  },
  {
    name: 'Can end game',
    commands: [
      ...TILE_L,
      [3, 0],
    ],
    result: [
      [1, 1, 1, 1],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ],
    ended: true,
  },
  {
    name: 'Move Up',
    commands: [
      ...TILE_L,
      [1, 0],
    ],
    result: [
      [2, 1, 1, 1],
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    ended: false,
  },
  {
    name: 'Move Down',
    commands: [
      ...TILE_L,
      [1, 1],
    ],
    result: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 0, 0, 0],
      [2, 1, 1, 1],
    ],
    ended: false,
  },
  {
    name: 'Move Left',
    commands: [
      ...TILE_L,
      [1, 2],
    ],
    result: [
      [2, 2, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ],
    ended: false,
  },
  {
    name: 'Move Right',
    commands: [
      ...TILE_L,
      [1, 3],
    ],
    result: [
      [0, 0, 2, 2],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ],
    ended: false,
  },
  {
    name: 'Move Up X2',
    commands: [
      ...TILE_L,
      [1, 0],
      [1, 0],
    ],
    result: [
      [3, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    ended: false,
  },
  {
    name: 'Move Down X2',
    commands: [
      ...TILE_L,
      [1, 1],
      [1, 1],
    ],
    result: [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [3, 1, 1, 1],
    ],
    ended: false,
  },
  {
    name: 'Move Left X2',
    commands: [
      ...TILE_L,
      [1, 2],
      [1, 2],
    ],
    result: [
      [3, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
    ],
    ended: false,
  },
  {
    name: 'Move Right X2',
    commands: [
      ...TILE_L,
      [1, 3],
      [1, 3],
    ],
    result: [
      [0, 0, 0, 3],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
      [0, 0, 0, 1],
    ],
    ended: false,
  },
]

async function deployZKApp(player: Mina.TestPublicKey, playerKey: PrivateKey, zkAppAddress: PublicKey, zkAppPrivateKey: PrivateKey) {
  const zkApp = new Game2048(zkAppAddress);
  const txn = await Mina.transaction(player, async () => {
    AccountUpdate.fundNewAccount(player);
    await zkApp.deploy();
    await zkApp.startGame(player);
  });
  await txn.prove();
  await txn.sign([zkAppPrivateKey, playerKey]).send();
  return zkApp
}

function printBoard(zkApp: Game2048) {
  const board = new Board(zkApp.board.get())
  board.printState()
}

function assertBoard(zkApp: Game2048, expected: number[][]) {
  const board = new Board(zkApp.board.get())
  expect(board.toArray()).toEqual(expected)
}

describe('Game 2048', () => {
  let player: Mina.TestPublicKey,
    playerKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey;

  beforeEach(async () => {
    let Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);

    [player] = Local.testAccounts;
    playerKey = player.key;

    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
  });

  it('generates and deploys tictactoe', async () => {
    const zkApp = await deployZKApp(player, playerKey, zkAppAddress, zkAppPrivateKey)
    const board = zkApp.board.get();
    expect(board).toEqual(Field(0));
  });

  for (const TESTCASE of TESTCASES) {
    it(TESTCASE.name, async () => {
      const zkApp = await deployZKApp(player, playerKey, zkAppAddress, zkAppPrivateKey)

      for (const command of TESTCASE.commands) {
        switch (command[0]) {
          case 1: {
            const signature = Signature.create(playerKey, [
              Field(1),
              Field(command[1] as number),
            ]);

            switch (command[1]) {
              case 0: {
                const txn = await Mina.transaction(player, async () => {
                  zkApp.moveUp(player, signature);
                });
                await txn.prove();
                await txn.sign([playerKey]).send();
                break;
              }

              case 1: {
                const txn = await Mina.transaction(player, async () => {
                  zkApp.moveDown(player, signature);
                });
                await txn.prove();
                await txn.sign([playerKey]).send();
                break;
              }

              case 2: {
                const txn = await Mina.transaction(player, async () => {
                  zkApp.moveLeft(player, signature);
                });
                await txn.prove();
                await txn.sign([playerKey]).send();
                break;
              }

              case 3: {
                const txn = await Mina.transaction(player, async () => {
                  zkApp.moveRight(player, signature);
                });
                await txn.prove();
                await txn.sign([playerKey]).send();
                break;
              }

              default: throw new Error('Invalid command')
            }
            break;
          }

          case 2: {
            const pos = command[1] as number[]
            const index = pos[0] * 4 + pos[1]
            const signature = Signature.create(playerKey, [
              Field(2),
              Field(index),
            ]);
            const txn = await Mina.transaction(player, async () => {
              zkApp.addTile(player, signature, Field(pos[0]), Field(pos[1]));
            });
            await txn.prove();
            await txn.sign([playerKey]).send();

            break;
          }

          case 3: {
            if (command[1] !== 0) {
              throw new Error('Invalid command')
            }

            const signature = Signature.create(playerKey, [
              Field(3),
              Field(0),
            ]);
            const txn = await Mina.transaction(player, async () => {
              zkApp.endGame(player, signature);
            });
            await txn.prove();
            await txn.sign([playerKey]).send();

            break;
          }

          default: throw new Error('Invalid command')
        }
      }

      expect(zkApp.gameDone.get()).toEqual(Bool(TESTCASE.ended))
      assertBoard(zkApp, TESTCASE.result)
    })
  }

  // it('deploys tictactoe & accepts a correct move', async () => {
  //   const zkApp = new TicTacToe(zkAppAddress);

  //   // deploy
  //   let txn = await Mina.transaction(player1, async () => {
  //     AccountUpdate.fundNewAccount(player1);
  //     await zkApp.deploy();
  //     await zkApp.startGame(player1, player2);
  //   });
  //   await txn.prove();
  //   await txn.sign([zkAppPrivateKey, player1Key]).send();

  //   // move
  //   const [x, y] = [Field(0), Field(0)];
  //   const signature = Signature.create(player1Key, [x, y]);
  //   txn = await Mina.transaction(player1, async () => {
  //     zkApp.play(player1, signature, x, y);
  //   });
  //   await txn.prove();
  //   await txn.sign([player1Key]).send();

  //   // check next player
  //   let isNextPlayer2 = zkApp.nextIsPlayer2.get();
  //   expect(isNextPlayer2).toEqual(Bool(true));
  // });
});
